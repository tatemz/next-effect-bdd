import { Context, Effect, Layer, Schema } from "effect";

/** The closed set of languages the Greeter speaks. Adding one breaks `Greeter.layerFor`. */
export const Language = Schema.Literals(["en", "es"]);
export type Language = typeof Language.Type;

export class Greeter extends Context.Service<
  Greeter,
  {
    readonly greet: Effect.Effect<string>;
  }
>()("Greeter") {
  static readonly layerEnglish = Layer.succeed(
    Greeter,
    Greeter.of({ greet: Effect.succeed("Hello!") }),
  );

  static readonly layerSpanish = Layer.succeed(
    Greeter,
    Greeter.of({ greet: Effect.succeed("¡Hola!") }),
  );

  /** Total mapping from the `Language` union to an implementation layer. */
  static layerFor(language: Language): Layer.Layer<Greeter> {
    switch (language) {
      case "en":
        return Greeter.layerEnglish;
      case "es":
        return Greeter.layerSpanish;
    }
  }
}
