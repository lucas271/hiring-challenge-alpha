import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
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
        
        fastify.get('/', async (request, reply) => {
            return reply.view('index', { title: 'Homepage', name: 'Guest' });
        });

        fastify.get('/talkAi/:lang', { websocket: true }, async (connection, req: FastifyRequest<{Params?: {lang: string}}>) => {            


            const initialLang = req.params?.lang || "en";

            const initialMessages = [
                new SystemMessage(`Translate the system text to the language: ${initialLang}. If the target language is unrecognized, translate to English instead. Do not mention the unrecognized language name in your response. When falling back to English, simply provide the English text followed by "(Language could not be identified. Using English as the default language.)". For valid language requests, provide only the translation without explanations.`),
                new HumanMessage("Hello, I'm your AI assistant. How can I help you today?"),
            ];

            const initialMessage = (await model.invoke(initialMessages)).content
            const conversationHistory = [new SystemMessage(String(initialMessage))];

            connection.send(initialMessage);

            connection.on('message', async (message) => {
                try {
                    const userMessage = new HumanMessage(String(message));
                    conversationHistory.push(userMessage);

                    const response = await model.invoke(conversationHistory);
                    
                    conversationHistory.push(userMessage);
                    conversationHistory.push(response);

                    connection.send(response.content);
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