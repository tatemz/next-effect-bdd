import { Context, Effect, Layer, Match, Schema } from "effect";

/**
 * The closed set of languages the Greeter speaks.
 *
 * A `Schema.Literals` union, so any other string fails decoding, and adding
 * a language without a case in `Greeter.layerFor` is a type error: the set
 * and its implementations cannot drift apart.
 *
 * @example
 * import { Language } from "./greeter.ts";
 *
 * Language.decodeUnknownSync("en"); // "en"
 * // Language.decodeUnknownSync("fr"); // throws: expected "en" | "es"
 */
export const Language = Schema.Literals(["en", "es"]);
export type Language = typeof Language.Type;

/**
 * Greets a visitor in one language.
 *
 * A `Context.Service` with a single `greet` effect, so pages and routes
 * depend on the capability rather than on which language implementation is
 * installed; pick an implementation with `Greeter.layerFor`.
 *
 * @example
 * import { Effect } from "effect";
 * import { Greeter } from "./greeter.ts";
 *
 * const greeting = Effect.gen(function* () {
 *   const greeter = yield* Greeter;
 *   return yield* greeter.greet;
 * });
 *
 * Effect.runSync(Effect.provide(greeting, Greeter.layerSpanish)); // "¡Hola!"
 */
export class Greeter extends Context.Service<
  Greeter,
  {
    readonly greet: Effect.Effect<string>;
  }
>()("Greeter") {
  /**
   * The English `Greeter`, greeting with "Hello!".
   *
   * The implementation `Greeter.layerFor("en")` returns; provide it with
   * `Effect.provide` or `HttpRouter.provideRequest`.
   *
   * @example
   * import { Effect } from "effect";
   * import { Greeter } from "./greeter.ts";
   *
   * const greeting = Effect.flatMap(Greeter, (greeter) => greeter.greet);
   * Effect.runSync(Effect.provide(greeting, Greeter.layerEnglish)); // "Hello!"
   */
  static readonly layerEnglish = Layer.succeed(
    Greeter,
    Greeter.of({ greet: Effect.succeed("Hello!") }),
  );

  /**
   * The Spanish `Greeter`, greeting with "¡Hola!".
   *
   * The implementation `Greeter.layerFor("es")` returns; provide it with
   * `Effect.provide` or `HttpRouter.provideRequest`.
   *
   * @example
   * import { Effect } from "effect";
   * import { Greeter } from "./greeter.ts";
   *
   * const greeting = Effect.flatMap(Greeter, (greeter) => greeter.greet);
   * Effect.runSync(Effect.provide(greeting, Greeter.layerSpanish)); // "¡Hola!"
   */
  static readonly layerSpanish = Layer.succeed(
    Greeter,
    Greeter.of({ greet: Effect.succeed("¡Hola!") }),
  );

  /**
   * Total mapping from the `Language` union to an implementation layer.
   *
   * Matched exhaustively over `Language`, so adding a language literal is a
   * compile error until a layer exists for it.
   *
   * @example
   * import { Greeter } from "./greeter.ts";
   *
   * const spanish = Greeter.layerFor("es"); // Layer.Layer<Greeter>
   */
  static layerFor(language: Language): Layer.Layer<Greeter> {
    return Match.value(language).pipe(
      Match.when("en", () => Greeter.layerEnglish),
      Match.when("es", () => Greeter.layerSpanish),
      Match.exhaustive,
    );
  }
}
