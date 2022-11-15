import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { cleanRequestId } from './helpers';
import { parse, getOperationAST } from 'graphql';
import { z } from 'zod';

const GraphQLPayloadSchema = z.object({
  query: z.string(),
  operationName: z.string().optional(),
});

const plugin: FastifyPluginAsync = async server => {
  function graphqlOperationName(request: FastifyRequest): string | undefined {
    let requestBody;
    if (request.method === 'GET') {
      rawPayload = request.query;
    } else if (request.method === 'POST') {
      rawPayload = request.body;
    } else {
      return undefined;
    }

    const payload = GraphQLPayloadSchema.safeParse(requestBody);
    if (!payload.success) {
      return undefined;
    }

    const { operationName, query } = payload.data;
    const operation = getOperationAST(parse(query), operationName);
    return operation?.name?.value;
  }

  server.addHook('onResponse', async (request, reply) => {
    const requestId = cleanRequestId(request.headers['x-request-id']);
    const operationName = graphqlOperationName(request);
    const message = [
      `[${reply.statusCode}]`,
      `(${request.ip})`,
      request.method,
      request.url,
      operationName ? `'${operationName}'` : undefined,
      `(${requestId})`,
    ]
      .filter(s => s)
      .join(' ');
    if (reply.statusCode < 500) {
      server.log.info(message);
    } else {
      server.log.error(message);
    }
  });
};

const requestLogsPlugin = fp(plugin, {
  name: 'fastify-request-logging',
});

export async function useRequestLogging(server: FastifyInstance) {
  await server.register(requestLogsPlugin);
}
