import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import fastifyWebsocket from "@fastify/websocket";
import fastifyView from "@fastify/view";
import fastifyStatic from "@fastify/static";
import ejs from "ejs";
import path from "node:path";

export async function buildApp(): Promise<FastifyInstance> {
    const fastify = Fastify({logger: true})
    await fastify.register(fastifyWebsocket);
    await fastify.register(fastifyView, {
        root: path.join(__dirname, 'views'),
        engine: {
            ejs: ejs,
        },
    })

    const model = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        temperature: 0
    });

    await fastify.register(fastifyStatic, {
        root: path.join(__dirname, 'public'),
        prefix: '/',
    })

    fastify.register((fastify) => {
        fastify.get('/health', (_req, res) => {
            try {
                res.send('Working!');
            } catch (error) {
                res.status(500).send('Server unavailable.');
            }
        });
        
        fastify.get('/', async (_request, reply) => {
            return reply.view('index', { title: 'Homepage', name: 'Guest' });
        });

        fastify.get('/talkAi/:lang', { websocket: true }, async (connection, req: FastifyRequest<{Params?: {lang: string}}>) => {            
            const initialLang = req.params?.lang || "en";

            const greetingMessages = [
                new SystemMessage(`Translate the system text to the language: ${initialLang}. If the target text is a unrecognized language or not a language, translate to English instead. Do not mention the unrecognized text in your response. When falling back to English, simply provide the English text followed by "(Language could not be identified. Using English as the default language.)". For valid language requests, provide only the translation without explanations.`),
                new HumanMessage("Hello, I'm your AI assistant. How can I help you today?"),
            ];

            const greetingMessage = String((await model.invoke(greetingMessages)).content)

            const conversationHistory: (HumanMessage | SystemMessage | AIMessage)[] = [new SystemMessage(greetingMessage)];

            connection.send(JSON.stringify({type: "AI", content: greetingMessage}));
            //message is expected to be a stringfied json object with content and type params.
            connection.on('message', async (message) => {
                try {
                    const parsedMessage: {content: string, type: string} = JSON.parse(String(message));
                    const userMessage = new HumanMessage(parsedMessage.content);
                    conversationHistory.push(userMessage);

                    const response = await model.invoke(conversationHistory);
                    
                    conversationHistory.push(userMessage);
                    conversationHistory.push(response);

                    connection.send(JSON.stringify({
                        type: response.getType(),
                        content: response.content
                    }));
                } catch (error) {
                    connection.send(JSON.stringify({
                        type: 'error',
                        content: 'Sorry, I encountered an error processing your request.'
                    }));
                }
            });
            
            connection.on('close', () => {
                console.log('WebSocket connection closed');
            });
        });
    }, {prefix: "/api/v1"})

    return fastify
}

export default buildApp