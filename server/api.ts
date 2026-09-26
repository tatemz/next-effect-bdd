import { Effect, Schema } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "effect/unstable/httpapi";
import { Greeter } from "../domain/greeter.ts";

/** The typed body of the health endpoint, shared by server and client. */
export const HealthResponse = Schema.Struct({
  status: Schema.tag("ok"),
  greeting: Schema.String,
});
export type HealthResponse = typeof HealthResponse.Type;

/**
 * The system group, marked `topLevel` so its endpoints sit directly on the
 * generated client (`client.health()`) instead of nested under the group.
 */
class SystemApi extends HttpApiGroup.make("system", { topLevel: true }).add(
  HttpApiEndpoint.get("health", "/health", {
    success: HealthResponse,
  }).annotateMerge(
    OpenApi.annotations({
      summary: "Report service health",
      description: "Answers with the greeting of the configured Greeter.",
    }),
  ),
) {}

/**
 * The whole API contract, schema-first. Serving, the OpenAPI document, and
 * the typed client all derive from this single definition, so server
 * responses, docs, and client cannot drift apart.
 */
export class Api extends HttpApi.make("poc-api")
  .add(SystemApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "next-effect-bdd POC API",
      version: "0.1.0",
    }),
  )
{}

/**
 * The client type generated from `Api`: one method per endpoint, with the
 * endpoint's Schema types on every channel. Build an instance with
 * `HttpApiClient.make(Api, { baseUrl })`.
 */
export type ApiClient = HttpApiClient.ForApi<typeof Api>;

/**
 * The `system` group implementation. Its `health` handler requires the
 * request-scoped `Greeter`, so the router still injects it with
 * `HttpRouter.provideRequest` exactly like the plain routes do.
 */
export const HealthHandlers = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers.handleAll({
    health: Effect.fn("Api.health")(function* () {
      const greeter = yield* Greeter;
      return { status: "ok", greeting: yield* greeter.greet } as const;
    }),
  }),
);
