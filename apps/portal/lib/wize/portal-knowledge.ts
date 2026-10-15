export type WizePortalAnswer = {
  answer: string;
  needsHuman: boolean;
  action: string | null;
  actionLabel: string | null;
};


export const WIZE_PORTAL_KNOWLEDGE = `
Bestemd Mijn Onderneming - gecontroleerde portaalfuncties:

- Dashboard: overzicht van de administratie en belangrijke aandachtspunten.
- Bankieren: banktransacties bekijken en controleren welke transacties nog niet gekoppeld zijn.
- Relaties: klanten en leveranciers bekijken.
- Documenten: documenten, bonnen en facturen bekijken of toevoegen.
- Communicatie: rechtstreeks een gesprek met Bestemd starten, bestaande gesprekken bekijken en berichten sturen. Dit is de juiste plek als de klant Randy, Ed of een andere medewerker van Bestemd wil spreken.
- Afspraken: een gesprek met Bestemd plannen via de afspraakomgeving. Een bestaande afspraak kan worden bekeken, verplaatst of geannuleerd.
- Rapportages: financiële rapportages en cijfers bekijken.
- Aangiften: informatie rond aangiften bekijken voor zover die in het portaal beschikbaar is.
- Bedrijfsmiddelen: bedrijfsmiddelen bekijken.
- Verzekeringen: verzekeringsinformatie bekijken.
- Instellingen: instellingen van het portaal beheren.

Gedragsregels:
- Zeg nooit dat een portaalfunctie niet bestaat als deze hierboven staat.
- Zeg nooit dat een handeling al is uitgevoerd als de applicatie dat niet heeft bevestigd.
- Als iemand een medewerker wil spreken of een bericht aan Bestemd wil sturen, verwijs naar Communicatie.
- Als iemand een afspraak wil plannen, wijzigen of annuleren, verwijs naar Afspraken.
- Verzin geen extra functies buiten deze gecontroleerde lijst.
`.trim();


function hasAny(
  value: string,
  words: string[],
) {
  return words.some(
    word =>
      value.includes(
        word,
      ),
  );
}


export function answerPortalQuestion(
  message: string,
): WizePortalAnswer | null {
  const question =
    message
      .toLowerCase()
      .trim();

  const communicationIntent =
    hasAny(
      question,
      [
        "bericht sturen",
        "berichtje sturen",
        "kan ik berichten",
        "kan ik een bericht",
        "randy berichten",
        "ed berichten",
        "randy spreken",
        "ed spreken",
        "medewerker spreken",
        "medewerker van bestemd",
        "iemand van bestemd",
        "echte medewerker",
        "echt persoon",
        "mens spreken",
        "chatten met bestemd",
        "spreken met bestemd",
        "contact met bestemd",
        "vraag aan bestemd",
      ],
    );

  if (communicationIntent) {
    return {
      answer:
        "Ja. Via Communicatie kun je rechtstreeks een bericht sturen naar Bestemd en een gesprek voeren met een medewerker. Open Communicatie om je vraag te sturen.",
      needsHuman:
        false,
      action:
        "Communicatie",
      actionLabel:
        "Open communicatie",
    };
  }

  const appointmentIntent =
    question.includes(
      "afspraak",
    ) &&
    hasAny(
      question,
      [
        "plan",
        "maken",
        "inplannen",
        "boeken",
        "wijzigen",
        "verplaatsen",
        "annuleren",
        "afzeggen",
        "gesprek",
      ],
    );

  if (appointmentIntent) {
    return {
      answer:
        "Ja. Via Afspraken kun je een gesprek met Bestemd plannen. Heb je al een afspraak, dan kun je die daar ook bekijken, verplaatsen of annuleren.",
      needsHuman:
        false,
      action:
        "Afspraken",
      actionLabel:
        "Open afspraken",
    };
  }

  if (
    hasAny(
      question,
      [
        "waar kan ik een bericht",
        "waar kan ik berichten",
        "waar staat communicatie",
        "communicatie openen",
      ],
    )
  ) {
    return {
      answer:
        "Je vindt dit bij Communicatie. Daar kun je een nieuw gesprek met Bestemd starten en bestaande gesprekken teruglezen.",
      needsHuman:
        false,
      action:
        "Communicatie",
      actionLabel:
        "Open communicatie",
    };
  }

  if (
    hasAny(
      question,
      [
        "wat kan ik in het portaal",
        "wat kan ik hier",
        "wat kan mijn onderneming",
        "wat kan dit portaal",
        "welke functies",
      ],
    )
  ) {
    return {
      answer:
        "In Mijn Onderneming kun je onder andere je cijfers bekijken, banktransacties controleren, klanten en leveranciers bekijken, documenten toevoegen, met Bestemd chatten, afspraken plannen, rapportages bekijken en naar je aangiften, bedrijfsmiddelen, verzekeringen en instellingen gaan.",
      needsHuman:
        false,
      action:
        "Dashboard",
      actionLabel:
        "Open dashboard",
    };
  }

  if (
    hasAny(
      question,
      [
        "waar kan ik mijn bank",
        "banktransacties bekijken",
        "bankieren openen",
      ],
    )
  ) {
    return {
      answer:
        "Dat vind je bij Bankieren. Daar kun je je banktransacties bekijken en zien welke transacties nog aandacht nodig hebben.",
      needsHuman:
        false,
      action:
        "Bankieren",
      actionLabel:
        "Open bankieren",
    };
  }

  if (
    hasAny(
      question,
      [
        "waar kan ik documenten",
        "bon uploaden",
        "factuur uploaden",
        "document uploaden",
      ],
    )
  ) {
    return {
      answer:
        "Dat kan bij Documenten. Daar kun je documenten, bonnen en facturen toevoegen en terugvinden.",
      needsHuman:
        false,
      action:
        "Documenten",
      actionLabel:
        "Open documenten",
    };
  }

  return null;
}
