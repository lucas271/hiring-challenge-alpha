import { AIMessageChunk, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { getCurlInfo } from "../services/curlCall";
import { getAllDocuments, getDocumentFileNames } from "../services/documentLoader";
import { WebSocket } from "ws";
import { executeQuery, buildDatabaseSchemas } from "../services/sqliteLoader";

export const generateAiResponse = async (
  model: ChatGoogleGenerativeAI,
  message: string,
  conversationHistory: (HumanMessage | SystemMessage | AIMessageChunk)[],
  socket: WebSocket
): Promise<AIMessageChunk> => {

  const curlTool = new DynamicStructuredTool({
    name: "curl_web_content",
    description: `
      Use this tool **only** for fetching real-time or dynamic public data (e.g., charts, news, or APIs).
    
      This tool is intended for:
      - Live music charts or today's new releases
      - Breaking news, sports, or time-sensitive data
      - Real-time pricing, weather, or events
    
      Do not use this tool for static or generic queries like "list some musics" or "get a list of songs".
    `.trim(),
    schema: z.object({
      query: z.string().describe("The query that is most likely to find the user's desired information."),
    }),
    func: async ({ query }) => {
      try {
        const result = await getCurlInfo(query, socket);
        const finalAnswer = await model.invoke([
          new SystemMessage(`
            based on the result of the used tool: ${result}
            answer the user's question.
          `.trim()),
          new HumanMessage(message),
        ]);

        
        return finalAnswer;
      } catch (e) {
        return `Failed to fetch data from with query: ${query}`;
      }
    },
  });

  const documentSearch = new DynamicStructuredTool({
    name: "search_documents",
    description: `
      Searches through internal offline documents based on a keyword or phrase.
      
      The user might speak in Portuguese or another language, but your search query must always be in ENGLISH, as the documents are written in English.
      
      Use this tool only if the user asks about something that could reasonably exist in local/internal documents.
      
      Documents filenames:
      ${JSON.stringify(getDocumentFileNames())}

      Infer meaningful English keywords or phrases from the user's message and pass it as the "query".
    `,
    schema: z.object({
      query: z.string().describe("A keyword or phrase to look for in the documents."),
    }),
    func: async ({ query }) => {
      try {
        const documents = await getAllDocuments();

        const result = documents.filter(doc =>
          doc.toLowerCase().includes(query.toLowerCase())
        );

        const finalAnswer = await model.invoke([
          new SystemMessage(`
            based on the result of the used tool: ${result}
            answer the user's question.
          `.trim()),
          new HumanMessage(message),
        ]);

        return finalAnswer;
      } catch (e) {
        return `Documents query error: ${e}`;
      }

    },
  });

  const sqliteTool = new DynamicStructuredTool({
    name: "query_sqlite_database",
    description: `
      Executes SQL SELECT queries against local offline SQLite databases.

      This tool must be used when:
      - The question is about music, genres, playlists, albums, charts, or artist data.
      - The user is listing, filtering, or counting structured information (e.g., songs, books, logs, records).
      - The information exists in a database schema (see below).

      This tool should be preferred over the online tool (curl_web_content) for music-related queries, unless the question clearly asks for real-time or trending data.

      Use this for queries like:
      - "List 10 musics of any genre"
      - "What are the top 5 rock songs?"
      - "Get me a list of jazz albums"

      Do not use this if the question is about today's trends, news, or latest releases.

      Available database schemas:
      ${await buildDatabaseSchemas()}
    `,
    schema: z.object({
      database: z.string().describe("The name of the database file to query (must end with .db)"),
      query: z.string().describe("A valid SQL SELECT query to execute against the database"),
    }),
    func: async ({ database, query }) => {
      try {
        if (!query.trim().toLowerCase().startsWith('select')) {
          return "For security reasons, only SELECT queries are allowed.";
        }
        
        const result = await executeQuery(database, query);
        const finalAnswer = await model.invoke([
          new SystemMessage(`
            based on the result of the used tool: ${result}
            answer the user's question.
          `.trim()),
          new HumanMessage(message),
        ]);

        return finalAnswer
      } catch (e) {
        return `Database query error: ${e}`;
      }
    },
  });

  const systemPrompt = new SystemMessage(`
      chat history: ${JSON.stringify(conversationHistory)}
      
      user's message: ${message}
      
      You are an intelligent assistant integrated with tools to fetch live data, search documents, and query databases.
      
      **Before evaluating which tool to use, always convert the user's message to english.
      **You must always attempt to answer directly based on available context, even if the user's question is vague or general. Do not ask for clarification. Do not ask for more information.**
      

      Offline tools (document search, SQLite) must be used whenever the question can reasonably be answered without live, real-time data.

      Only use the online curl tool if the user's question clearly involves current events, real-time updates, or trending data.

      You must always attempt to answer directly based on available context, even if the user's question is vague or general. Do not ask for clarification. Do not ask for more information.    
      - If the query can use a tool,  call the tool directly.
      - You must never reply with "could you please clarify" or similar phrases.
      - Respond in a helpful, data-focused manner, even when assumptions are needed.
      
      ONLY if it seens very likely that no tool can answer the user's question, you should give a general answer based on your internal knowledge

      REMINDER: YOU DO NOT HAVE ACCESS TO DOCUMENTS, CURL COMMANDS, OR DATABASES AT THIS MOMENT.
    `.trim());

  const tools = [curlTool, documentSearch, sqliteTool];
  const llmWithTools = model.bindTools(tools);

  const aiAnswer = await llmWithTools.invoke([
    systemPrompt,
    new HumanMessage(message),
  ]);

  if (Array.isArray(aiAnswer.content)) {
    const functionCall = aiAnswer.content.find(
      (c) => typeof c === "object" && "functionCall" in c
    );
    if (functionCall && "functionCall" in functionCall) {
      const { name, args } = functionCall.functionCall;
      const tool = tools.find(t => t.name === name);
      if (!tool) {
        return new AIMessageChunk({ content: `Tool "${name}" not found.` });
      }

      const result = await tool.func(args);

      return new AIMessageChunk(result);
    }
  }

  return aiAnswer;
};
