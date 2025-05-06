import Fastify, { FastifyInstance } from "fastify"
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
    });

    return fastify
}

export default buildApp

