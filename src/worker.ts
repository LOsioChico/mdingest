import { Container } from "@cloudflare/containers";

/**
 * Cloudflare Container wrapping the NestJS + Bun API.
 * The container runs the Dockerfile, which starts `bun run src/main.ts`
 * listening on port 3000. The Worker forwards all requests to it.
 */

export class MdingestContainer extends Container {
  override defaultPort = 3000;
  override sleepAfter = "5m";
}

interface MdIngestEnv {
  MDINGEST_CONTAINER: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: MdIngestEnv): Promise<Response> {
    // "mdingest" is a Durable Object instance name — arbitrary but must be constant.
    // Same name on every request = all traffic hits the same single container instance.
    // With max_instances = 1 in wrangler.toml, this gives us a singleton deployment.
    const container = env.MDINGEST_CONTAINER.getByName("mdingest");
    return await container.fetch(request);
  },
} satisfies ExportedHandler<MdIngestEnv>;
