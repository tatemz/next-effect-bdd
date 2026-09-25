import { Context, Effect, Layer } from "effect";

export class Greeter extends Context.Service<
  Greeter,
  {
    readonly greet: () => Effect.Effect<string>;
  }
>()("Greeter") {}

export const GreeterEnglish = Layer.succeed(Greeter, {
  greet: () => Effect.succeed("Hello!"),
});

export const GreeterSpanish = Layer.succeed(Greeter, {
  greet: () => Effect.succeed("¡Hola!"),
});
