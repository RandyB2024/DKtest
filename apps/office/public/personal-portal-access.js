const el = (
  tag,
  text,
  className,
) => {
  const node =
    document.createElement(tag);

  if (text !== undefined) {
    node.textContent =
      text;
  }

  if (className) {
    node.className =
      className;
  }

  return node;
};


export async function
mountPersonalPortalAccess(
  root,
  api,
  relationship,
  canManage,
) {
  root.replaceChildren();


  const section =
    el(
      "section",
      undefined,
      "panel personal-access-panel",
    );


  const heading =
    el(
      "div",
      undefined,
      "personal-access-heading",
    );


  const copy =
    el("div");

  copy.append(
    el(
      "p",
      "PERSOONLIJK",
      "eyebrow",
    ),

    el(
      "h2",
      "Mijn Bestemming",
    ),

    el(
      "p",
      "Persoonlijke toegang staat volledig los van Mijn Onderneming.",
      "muted",
    ),
  );


  heading.append(copy);

  section.append(heading);


  const status =
    el(
      "p",
      "",
      "personal-access-status",
    );

  status.setAttribute(
    "role",
    "status",
  );

  section.append(status);


  root.append(section);


  async function load() {
    status.textContent =
      "Persoonlijke toegang laden…";


    try {
      const data =
        await api(
          "/api/relationships/" +
            encodeURIComponent(
              relationship.id,
            ) +
            "/personal-access",
        );


      render(
        data.people ?? [],
      );

      status.textContent =
        "";

    } catch (error) {
      status.textContent =
        error.message ||
        "Persoonlijke toegang kan niet worden geladen.";
    }
  }


  function render(
    people,
  ) {
    section
      .querySelector(
        ".personal-access-list",
      )
      ?.remove();


    const list =
      el(
        "div",
        undefined,
        "personal-access-list",
      );


    if (!people.length) {
      list.append(
        el(
          "p",
          "Er is nog geen actieve klantgebruiker aan deze klantrelatie gekoppeld.",
          "muted",
        ),
      );

      section.append(
        list,
      );

      return;
    }


    for (
      const person of people
    ) {
      const row =
        el(
          "div",
          undefined,
          "personal-access-row",
        );


      const details =
        el(
          "div",
          undefined,
          "personal-access-person",
        );


      details.append(
        el(
          "strong",
          person.displayName ||
            "Onbekende gebruiker",
        ),

        el(
          "small",
          person.email || "",
        ),
      );


      const state =
        el(
          "span",
          person.active
            ? "Actief"
            : "Niet actief",
          person.active
            ? "clients-badge clients-badge--active"
            : "clients-badge",
        );


      const button =
        el(
          "button",
          person.active
            ? "Toegang intrekken"
            : "Toegang activeren",
          person.active
            ? "customer-action-danger"
            : "clients-button clients-button--primary",
        );


      button.type =
        "button";

      button.disabled =
        !canManage;


      button.onclick =
        async () => {
          if (
            !canManage
          ) {
            return;
          }


          const enable =
            !person.active;


          const confirmed =
            window.confirm(
              enable
                ? `Mijn Bestemming activeren voor ${person.displayName}?`
                : `Mijn Bestemming intrekken voor ${person.displayName}?`,
            );


          if (
            !confirmed
          ) {
            return;
          }


          button.disabled =
            true;

          status.textContent =
            enable
              ? "Persoonlijke toegang activeren…"
              : "Persoonlijke toegang intrekken…";


          try {
            await api(
              "/api/relationships/" +
                encodeURIComponent(
                  relationship.id,
                ) +
                "/personal-access",

              {
                userId:
                  person.userId,

                enabled:
                  enable,
              },
            );


            await load();

            status.textContent =
              enable
                ? "Mijn Bestemming is geactiveerd."
                : "Mijn Bestemming is ingetrokken.";

          } catch (error) {
            status.textContent =
              error.message ||
              "Wijziging is niet gelukt.";

            button.disabled =
              false;
          }
        };


      const actions =
        el(
          "div",
          undefined,
          "personal-access-actions",
        );

      actions.append(
        state,
        button,
      );


      row.append(
        details,
        actions,
      );

      list.append(
        row,
      );
    }


    if (!canManage) {
      list.append(
        el(
          "p",
          "Uw Office-rol heeft alleen leesrechten.",
          "muted",
        ),
      );
    }


    section.append(
      list,
    );
  }


  await load();
}
