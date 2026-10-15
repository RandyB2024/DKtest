type WizeOllamaInput = {
  question: string;

  organization: {
    id: string;
    name: string;
  };

  context: {
    month: {
      revenueCents: number;
      costsCents: number;
      resultCents: number;
    };

    receivables: {
      totalCents: number;
      overdueCents: number;
      count: number;
    };

    payables: {
      totalCents: number;
      overdueCents: number;
      count: number;
    };

    bank: {
      unmatchedCount: number;
      suggestedCount: number;
      matchedCount: number;
      transactionCount: number;
    };
  };
};


type WizeOllamaResult = {
  answer: string;
  needsHuman: boolean;
  action: string | null;
  actionLabel: string | null;
};


function euro(
  cents: number
) {
  return new Intl.NumberFormat(
    "nl-NL",
    {
      style: "currency",
      currency: "EUR",
    }
  ).format(
    cents / 100
  );
}


function safeAction(
  value: unknown
) {
  const allowed =
    new Set([
      "Dashboard",
      "Rapportages",
      "Klanten",
      "Bankieren",
      "Documenten",
      "Afspraken",
      "Aangiften",
      null,
    ]);

  return allowed.has(
    value as string | null
  )
    ? (
        value as string | null
      )
    : null;
}


export async function askWizeOllama(
  input: WizeOllamaInput
): Promise<WizeOllamaResult | null> {
  const baseUrl =
    process.env
      .WIZE_OLLAMA_URL
      ?.trim();

  const bridgeKey =
    process.env
      .WIZE_BRIDGE_KEY
      ?.trim();

  if (
    !baseUrl ||
    !bridgeKey
  ) {
    return null;
  }


  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      120000
    );


  const systemPrompt = `
Je bent Wize, de eenvoudige digitale assistent van Bestemd.

Belangrijk:
- Bestemd is de bron van waarheid; jij verzint nooit feiten.
- Gebruik alleen gegevens die letterlijk in de meegegeven informatie staan.
- Maak nooit zelf een relatie tussen een bedrijf, klant, leverancier, factuur of bedrag.
- Beweer nooit dat Bestemd iets automatisch verstuurt, koppelt, plant of uitvoert als dat niet letterlijk is bevestigd.
- Geef geen fiscaal, juridisch of wettelijk advies.
- Als je iets niet zeker weet, zeg dat kort en duidelijk.
- Schrijf alleen in eenvoudig, natuurlijk Nederlands.
- Gebruik korte zinnen en geen jargon.
- Geef geen oordeel zoals "goed", "veilig" of "gezond" over de financiële situatie.
- Noem geen andere onderneming dan de geselecteerde onderneming.
- Geen markdown.
- Geef uitsluitend geldige JSON terug:
{"answer":"tekst","needsHuman":false,"action":null,"actionLabel":null}
`.trim();


  const contextPrompt = `
Onderneming:
${input.organization.name}

Huidige maand:
Omzet: ${euro(input.context.month.revenueCents)}
Kosten: ${euro(input.context.month.costsCents)}
Resultaat: ${euro(input.context.month.resultCents)}

Debiteuren:
Openstaand: ${euro(input.context.receivables.totalCents)}
Vervallen: ${euro(input.context.receivables.overdueCents)}
Aantal openstaand: ${input.context.receivables.count}

Crediteuren:
Openstaand: ${euro(input.context.payables.totalCents)}
Vervallen: ${euro(input.context.payables.overdueCents)}
Aantal openstaand: ${input.context.payables.count}

Bank:
Aantal transacties: ${input.context.bank.transactionCount}
Nog niet gekoppeld: ${input.context.bank.unmatchedCount}
Voorgestelde koppelingen: ${input.context.bank.suggestedCount}
Gekoppeld: ${input.context.bank.matchedCount}

Vraag klant:
${input.question}
`.trim();


  try {
    console.log("=== WIZE OLLAMA DEBUG ===");
    console.log("URL:", baseUrl);
    console.log("MODEL:", process.env.WIZE_OLLAMA_MODEL || "qwen2.5:3b");
    console.log("BRIDGE KEY PRESENT:", Boolean(bridgeKey));
    console.log("BRIDGE KEY LENGTH:", bridgeKey?.length ?? 0);

    const startedAt = Date.now();

    const response =
      await fetch(
        `${baseUrl.replace(/\/+$/, "")}/api/chat`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${bridgeKey}`,
          },

          signal:
            controller.signal,

          body:
            JSON.stringify({
              model:
                process.env
                  .WIZE_OLLAMA_MODEL
                  ?.trim()
                ||
                "qwen2.5:3b",

              stream:
                false,

              format:
                "json",

              keep_alive:
                "30m",

              options: {
                temperature:
                  0.1,
                num_predict:
                  120,
                num_ctx:
                  2048,
              },

              messages: [
                {
                  role:
                    "system",
                  content:
                    systemPrompt,
                },
                {
                  role:
                    "user",
                  content:
                    contextPrompt,
                },
              ],
            }),
        }
      );


    console.log("OLLAMA HTTP STATUS:", response.status);
    console.log(
      "WIZE OLLAMA TIME:",
      Date.now() - startedAt,
      "ms",
    );

    if (!response.ok) {
      console.error("OLLAMA RESPONSE NOT OK:", response.status);
      return null;
    }


    const data =
      await response.json() as {
        message?: {
          content?: string;
        };
      };


    const raw =
      data.message
        ?.content;

    if (!raw) {
      return null;
    }


    const parsed =
      JSON.parse(raw) as {
        answer?: unknown;
        needsHuman?: unknown;
        action?: unknown;
        actionLabel?: unknown;
      };


    if (
      typeof parsed.answer !==
        "string"
      ||
      !parsed.answer.trim()
      ||
      parsed.answer.length >
        4000
    ) {
      return null;
    }


    return {
      answer:
        parsed.answer.trim(),

      needsHuman:
        parsed.needsHuman ===
          true,

      action:
        safeAction(
          parsed.action
        ),

      actionLabel:
        typeof parsed
          .actionLabel ===
          "string"
          &&
          parsed.actionLabel
            .trim()
          &&
          parsed.actionLabel
            .length <= 120
          ? parsed
              .actionLabel
              .trim()
          : null,
    };

  } catch (error) {
    console.error("WIZE OLLAMA ERROR:", error);
    return null;

  } finally {
    clearTimeout(
      timeout
    );
  }
}









