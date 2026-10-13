const esc = value =>
  String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]
  );


const capabilityDefinitions = [
  {
    key:
      "proactiveContact",

    title:
      "Proactief contact",

    description:
      "Wize mag zelf een gesprek starten als de administratie aandacht nodig heeft.",
  },

  {
    key:
      "requestDocuments",

    title:
      "Documenten opvragen",

    description:
      "Wize mag vragen om ontbrekende facturen, bonnetjes of andere documenten.",
  },

  {
    key:
      "suggestAppointments",

    title:
      "Afspraken voorstellen",

    description:
      "Wize mag periodieke gesprekken herkennen en voorstellen om een afspraak te plannen.",
  },

  {
    key:
      "explainFinancials",

    title:
      "Financiële uitleg",

    description:
      "Wize mag cijfers uit de onderneming in begrijpelijke taal uitleggen.",
  },

  {
    key:
      "signalOverdueInvoices",

    title:
      "Vervallen facturen signaleren",

    description:
      "Wize mag wijzen op klantfacturen die over de betaaltermijn zijn.",
  },

  {
    key:
      "debtorReminders",

    title:
      "Debiteurenherinneringen",

    description:
      "Wize mag voorstellen om achterstallige klanten op te volgen.",
  },

  {
    key:
      "suggestBookings",

    title:
      "Boekingen voorstellen",

    description:
      "Wize mag een boekhoudkundige verwerking voorstellen, maar niet definitief maken.",
  },

  {
    key:
      "finalizeBookings",

    title:
      "Boekingen definitief maken",

    description:
      "Risicovolle bevoegdheid. Standaard uitgeschakeld.",
    risky:
      true,
  },

  {
    key:
      "submitTaxReturns",

    title:
      "Aangiften indienen",

    description:
      "Risicovolle bevoegdheid. Standaard uitgeschakeld.",
    risky:
      true,
  },

  {
    key:
      "initiatePayments",

    title:
      "Betalingen starten",

    description:
      "Risicovolle bevoegdheid. Standaard uitgeschakeld.",
    risky:
      true,
  },
];


export async function mountWizeAdmin(
  root,
  api,
  officeData
) {
  const organizations =
    officeData
      ?.organizations ??
    [];

  let selectedOrganizationId =
    organizations[0]?.id ??
    "";

  let policy =
    null;

  let appointmentStatus =
    null;

  let activity =
    [];

  let busy =
    false;


  root.innerHTML = `
    <div class="wize-admin">

      <section class="wize-admin-hero">
        <div>
          <p class="eyebrow">
            WIZE BEHEER
          </p>

          <h2>
            Slim inzicht. Duidelijke richting.
          </h2>

          <p>
            Bepaal wat Wize algemeen weet,
            hoe Wize zich per onderneming
            gedraagt en welke acties zijn
            toegestaan.
          </p>
        </div>

        <div class="wize-admin-shield">
          <strong>
            Harde beveiligingsgrens
          </strong>

          <span>
            Regels in Office kunnen nooit
            toegang tot andere ondernemingen
            of persoonlijke gegevens geven.
          </span>
        </div>
      </section>


      <section class="panel wize-admin-company">

        <div class="wize-admin-section-head">
          <div>
            <p class="eyebrow">
              ONDERNEMING
            </p>

            <h3>
              Voor wie stel je Wize in?
            </h3>
          </div>
        </div>

        <label>
          Onderneming

          <select
            data-organization
          >
            ${
              organizations
                .map(
                  organization => `
                    <option
                      value="${esc(
                        organization.id
                      )}"
                    >
                      ${esc(
                        organization.name
                      )}
                    </option>
                  `
                )
                .join("")
            }
          </select>
        </label>

      </section>


      <div
        class="wize-admin-status"
        data-status
        role="status"
      ></div>

      <div
        class="wize-admin-error"
        data-error
        role="alert"
      ></div>


      <section
        class="panel"
        data-security
      ></section>


      <section
        class="panel"
        data-capabilities
      ></section>


      <section
        class="panel"
        data-appointments
      ></section>


      <section
        class="panel"
        data-activity
      ></section>


      <section
        class="panel"
        data-org-rules
      ></section>


      <section
        class="panel"
        data-global-rules
      ></section>


      <section
        class="panel"
        data-add-rule
      ></section>

    </div>
  `;


  const organizationSelect =
    root.querySelector(
      "[data-organization]"
    );

  const statusTarget =
    root.querySelector(
      "[data-status]"
    );

  const errorTarget =
    root.querySelector(
      "[data-error]"
    );


  function status(
    message = ""
  ) {
    statusTarget.textContent =
      message;
  }


  function error(
    message = ""
  ) {
    errorTarget.textContent =
      message;
  }


  function renderSecurity() {
    const target =
      root.querySelector(
        "[data-security]"
      );

    const hardSecurity =
      policy
        ?.hardSecurity ??
      {};

    target.innerHTML = `
      <div class="wize-admin-section-head">
        <div>
          <p class="eyebrow">
            HARD SECURITY
          </p>

          <h3>
            Niet aanpasbaar
          </h3>

          <p>
            Dit zijn systeemgrenzen.
            Ook Bestemd Office kan deze
            niet via Wize-regels uitschakelen.
          </p>
        </div>
      </div>

      <div class="wize-security-grid">

        <article>
          <strong>
            Geen toegang tot andere ondernemingen
          </strong>

          <span>
            ${
              hardSecurity
                .crossOrganizationAccess ===
              false
                ? "Actief"
                : "Controle vereist"
            }
          </span>
        </article>

        <article>
          <strong>
            Geen persoonlijke data in zakelijke scope
          </strong>

          <span>
            ${
              hardSecurity
                .personalDataInBusinessScope ===
              false
                ? "Actief"
                : "Controle vereist"
            }
          </span>
        </article>

        <article>
          <strong>
            Model kiest nooit onderneming
          </strong>

          <span>
            ${
              hardSecurity
                .modelChoosesOrganization ===
              false
                ? "Actief"
                : "Controle vereist"
            }
          </span>
        </article>

        <article>
          <strong>
            Geen service-role voor klant-Wize
          </strong>

          <span>
            ${
              hardSecurity
                .serviceRoleForCustomerWize ===
              false
                ? "Actief"
                : "Controle vereist"
            }
          </span>
        </article>

      </div>
    `;
  }



  function formatActivityDate(
    value
  ) {
    if (!value) {
      return "Onbekend";
    }

    try {
      return new Intl.DateTimeFormat(
        "nl-NL",
        {
          day:
            "numeric",

          month:
            "short",

          year:
            "numeric",

          hour:
            "2-digit",

          minute:
            "2-digit",
        }
      ).format(
        new Date(value)
      );
    } catch {
      return "Onbekend";
    }
  }


  function activityLabel(
    type
  ) {
    const labels = {
      shown:
        "Getoond aan klant",

      reminded:
        "Herinnering gestuurd",

      customer_action:
        "Klant heeft actie ondernomen",

      escalated:
        "Doorgestuurd naar Bestemd",

      conversation_linked:
        "Gekoppeld aan gesprek",

      resolved:
        "Opgelost",
    };

    return labels[type] ??
      type ??
      "Activiteit";
  }


  function eventTypeLabel(
    type
  ) {
    const labels = {
      bank_document_missing:
        "Ontbrekend document",

      appointment_due:
        "Afspraak nodig",

      overdue_invoice:
        "Vervallen factuur",
    };

    return labels[type] ??
      type ??
      "Wize-signaal";
  }


  function renderActivity() {
    const target =
      root.querySelector(
        "[data-activity]"
      );


    if (!target) {
      return;
    }


    const rows =
      Array.isArray(activity)
        ? activity
        : [];


    target.innerHTML = `
      <div class="wize-admin-section-head">
        <div>
          <p class="eyebrow">
            WIZE ACTIVITEIT
          </p>

          <h3>
            Wat heeft Wize al gedaan?
          </h3>

          <p>
            Hier zie je per onderneming welke signalen
            Wize heeft getoond en hoe de klant daarop
            heeft gereageerd.
          </p>
        </div>

        <span class="wize-activity-count">
          ${esc(rows.length)}
        </span>
      </div>


      ${
        rows.length
          ? `
            <div class="wize-activity-list">

              ${
                rows
                  .map(
                    item => `
                      <article class="wize-activity-item">

                        <div class="wize-activity-marker"></div>

                        <div class="wize-activity-copy">

                          <div class="wize-activity-topline">

                            <span class="wize-activity-type">
                              ${esc(
                                eventTypeLabel(
                                  item.eventType
                                )
                              )}
                            </span>

                            <time>
                              ${esc(
                                formatActivityDate(
                                  item.activityCreatedAt
                                )
                              )}
                            </time>

                          </div>

                          <strong>
                            ${esc(
                              item.title ??
                              "Wize-signaal"
                            )}
                          </strong>

                          <p>
                            ${esc(
                              activityLabel(
                                item.activityType
                              )
                            )}
                          </p>

                          <div class="wize-activity-meta">

                            <span>
                              Status:
                              <b>
                                ${esc(
                                  item.eventStatus ??
                                  "-"
                                )}
                              </b>
                            </span>

                            ${
                              item.activityConversationId ||
                              item.conversationId
                                ? `
                                  <span>
                                    Communicatie gekoppeld
                                  </span>
                                `
                                : ""
                            }

                          </div>

                        </div>

                      </article>
                    `
                  )
                  .join("")
              }

            </div>
          `
          : `
            <div class="wize-activity-empty">
              <strong>
                Nog geen Wize-activiteit
              </strong>

              <p>
                Zodra Wize een signaal toont of een klant
                daarop reageert, verschijnt dat hier.
              </p>
            </div>
          `
      }
    `;
  }



  function renderAppointments() {
    const target =
      root.querySelector(
        "[data-appointments]"
      );


    if (!target) {
      return;
    }


    if (
      !appointmentStatus
    ) {
      target.innerHTML = `
        <div class="wize-admin-section-head">
          <div>
            <p class="eyebrow">
              GESPREKSCYCLUS
            </p>

            <h3>
              Nog geen afspraakgegevens
            </h3>
          </div>
        </div>

        <p class="muted">
          Er is nog geen gespreksstatus beschikbaar
          voor deze onderneming.
        </p>
      `;

      return;
    }


    const program =
      appointmentStatus
        .program ?? {};


    const next =
      appointmentStatus
        .nextRequiredMeeting;


    const planned =
      appointmentStatus
        .nextAppointment;


    const total =
      Number(
        program
          .meetingsPerYear ??
        4
      );


    const completed =
      Number(
        appointmentStatus
          .completedCount ??
        0
      );


    const plannedCount =
      Number(
        appointmentStatus
          .plannedCount ??
        0
      );


    const remaining =
      Number(
        appointmentStatus
          .remainingCount ??
        0
      );


    let plannedText =
      "Geen afspraak gepland";


    if (
      planned
        ?.startsAt
    ) {
      try {
        plannedText =
          new Intl.DateTimeFormat(
            "nl-NL",
            {
              weekday:
                "long",

              day:
                "numeric",

              month:
                "long",

              year:
                "numeric",

              hour:
                "2-digit",

              minute:
                "2-digit",
            }
          ).format(
            new Date(
              planned.startsAt
            )
          );
      } catch {
        plannedText =
          "Afspraak gepland";
      }
    }


    const nextLabel =
      next
        ? (
            next.type ===
            "annual_review"
              ? `Gesprek ${next.sequenceNumber} · jaaroverzicht · ±${next.durationMinutes} min`
              : `Gesprek ${next.sequenceNumber} · periodiek · ±${next.durationMinutes} min`
          )
        : (
            remaining === 0
              ? "Gesprekscyclus compleet"
              : "Nog te bepalen"
          );


    target.innerHTML = `
      <div class="wize-admin-section-head">
        <div>
          <p class="eyebrow">
            GESPREKSCYCLUS
          </p>

          <h3>
            Gesprekken ${
              esc(
                appointmentStatus
                  .year
              )
            }
          </h3>

          <p>
            Bestemd plant ${
              esc(total)
            } gesprekken per jaar:
            ${
              esc(
                Math.max(
                  total - 1,
                  0
                )
              )
            } periodieke gesprekken en
            één uitgebreid jaaroverzicht.
          </p>
        </div>

        <span class="wize-meeting-score">
          ${esc(completed)}/${esc(total)}
        </span>
      </div>


      <div class="wize-meeting-metrics">

        <article>
          <span>
            Afgerond
          </span>

          <strong>
            ${esc(completed)}
          </strong>
        </article>

        <article>
          <span>
            Gepland
          </span>

          <strong>
            ${esc(plannedCount)}
          </strong>
        </article>

        <article>
          <span>
            Nog te gaan
          </span>

          <strong>
            ${esc(remaining)}
          </strong>
        </article>

      </div>


      <div class="wize-meeting-detail">

        <div>
          <span>
            Volgende stap
          </span>

          <strong>
            ${esc(nextLabel)}
          </strong>
        </div>

        <div>
          <span>
            Geplande afspraak
          </span>

          <strong>
            ${esc(plannedText)}
          </strong>
        </div>

      </div>


      ${
        planned
          ?.id
          ? `
            <div class="customer-buttons">
              <button
                type="button"
                class="primary"
                data-complete-appointment
              >
                Gesprek als afgerond markeren
              </button>
            </div>
          `
          : ""
      }
    `;


    const completeButton =
      target.querySelector(
        "[data-complete-appointment]"
      );


    if (
      completeButton &&
      planned?.id
    ) {
      completeButton.onclick =
        async () => {

          if (busy) {
            return;
          }


          const confirmed =
            window.confirm(
              "Is dit gesprek daadwerkelijk afgerond?"
            );


          if (!confirmed) {
            return;
          }


          busy = true;
          error("");
          status(
            "Gesprek afronden..."
          );

          completeButton.disabled =
            true;


          try {
            await api(
              "/api/wize-admin",
              {
                action:
                  "completeAppointment",

                appointmentId:
                  planned.id,
              }
            );


            await loadPolicy();

            status(
              "Gesprek als afgerond geregistreerd."
            );

          } catch (
            caughtError
          ) {
            error(
              caughtError.message
            );

            status("");

          } finally {
            busy = false;

            if (
              completeButton
                .isConnected
            ) {
              completeButton.disabled =
                false;
            }
          }
        };
    }
  }


  function renderCapabilities() {
    const target =
      root.querySelector(
        "[data-capabilities]"
      );

    const capabilities =
      policy
        ?.capabilities ??
      {};

    target.innerHTML = `
      <div class="wize-admin-section-head">
        <div>
          <p class="eyebrow">
            BEVOEGDHEDEN
          </p>

          <h3>
            Wat mag Wize hier doen?
          </h3>

          <p>
            Deze instellingen gelden alleen
            voor de geselecteerde onderneming.
          </p>
        </div>
      </div>

      <form
        data-capability-form
        class="wize-capability-list"
      >

        ${
          capabilityDefinitions
            .map(
              item => `
                <label class="wize-capability ${
                  item.risky
                    ? "risky"
                    : ""
                }">

                  <input
                    type="checkbox"
                    name="${esc(
                      item.key
                    )}"
                    ${
                      capabilities[
                        item.key
                      ]
                        ? "checked"
                        : ""
                    }
                  >

                  <span>
                    <strong>
                      ${esc(
                        item.title
                      )}
                    </strong>

                    <small>
                      ${esc(
                        item.description
                      )}
                    </small>
                  </span>

                </label>
              `
            )
            .join("")
        }

        <div class="customer-buttons">
          <button
            type="submit"
            class="primary"
          >
            Bevoegdheden opslaan
          </button>
        </div>

      </form>
    `;


    target
      .querySelector(
        "[data-capability-form]"
      )
      .onsubmit =
        async event => {
          event.preventDefault();

          if (
            busy
          ) {
            return;
          }

          busy = true;
          error("");
          status(
            "Bevoegdheden opslaan..."
          );

          const form =
            event.currentTarget;

          const capabilities =
            Object.fromEntries(
              capabilityDefinitions
                .map(
                  item => [
                    item.key,
                    form.elements[
                      item.key
                    ].checked,
                  ]
                )
            );

          try {
            const result =
              await api(
                "/api/wize-admin",
                {
                  action:
                    "saveCapabilities",

                  organizationId:
                    selectedOrganizationId,

                  capabilities,
                }
              );

            policy =
              result.policy;

            status(
              "Bevoegdheden opgeslagen."
            );

            renderAll();
          } catch (
            caughtError
          ) {
            error(
              caughtError.message
            );

            status("");
          } finally {
            busy = false;
          }
        };
  }


  function rulesTable(
    rules,
    kind
  ) {
    if (
      !rules.length
    ) {
      return `
        <p class="muted">
          Nog geen regels ingesteld.
        </p>
      `;
    }

    return `
      <div class="wize-rule-list">

        ${
          rules
            .map(
              rule => `
                <article class="wize-rule-card">

                  <div class="wize-rule-top">
                    <div>
                      <span class="wize-rule-category">
                        ${esc(
                          rule.category
                        )}
                      </span>

                      <strong>
                        ${esc(
                          rule.title
                        )}
                      </strong>
                    </div>

                    ${
                      kind ===
                      "organization"
                        ? `
                          <span class="wize-rule-mode ${esc(
                            rule.mode
                          )}">
                            ${esc(
                              rule.mode
                            )}
                          </span>
                        `
                        : ""
                    }
                  </div>

                  <p>
                    ${esc(
                      rule.instruction
                    )}
                  </p>

                  <small>
                    ${esc(
                      rule.key
                    )}
                    · prioriteit
                    ${esc(
                      rule.priority
                    )}
                  </small>

                </article>
              `
            )
            .join("")
        }

      </div>
    `;
  }


  function renderRules() {
    const orgTarget =
      root.querySelector(
        "[data-org-rules]"
      );

    const globalTarget =
      root.querySelector(
        "[data-global-rules]"
      );


    orgTarget.innerHTML = `
      <div class="wize-admin-section-head">
        <div>
          <p class="eyebrow">
            ONDERNEMINGSSPECIFIEK
          </p>

          <h3>
            Regels voor deze onderneming
          </h3>

          <p>
            Gebruik dit voor uitzonderingen,
            extra context of zaken die Wize
            juist moet vermijden.
          </p>
        </div>
      </div>

      ${
        rulesTable(
          policy
            ?.organizationRules ??
          [],
          "organization"
        )
      }
    `;


    globalTarget.innerHTML = `
      <div class="wize-admin-section-head">
        <div>
          <p class="eyebrow">
            ALGEMENE KENNIS & GEDRAG
          </p>

          <h3>
            Bestemd-brede regels
          </h3>

          <p>
            Deze regels gelden voor alle
            ondernemingen.
          </p>
        </div>
      </div>

      ${
        rulesTable(
          policy
            ?.globalRules ??
          [],
          "global"
        )
      }
    `;
  }


  function renderAddRule() {
    const target =
      root.querySelector(
        "[data-add-rule]"
      );

    target.innerHTML = `
      <div class="wize-admin-section-head">
        <div>
          <p class="eyebrow">
            WIZE LEREN
          </p>

          <h3>
            Nieuwe regel toevoegen
          </h3>

          <p>
            Geef Wize een duidelijke regel.
            Dit traint geen taalmodel:
            de regel wordt gecontroleerd
            toegepast als Bestemd-beleid.
          </p>
        </div>
      </div>


      <form
        data-rule-form
        class="wize-rule-form"
      >

        <div class="wize-rule-form-grid">

          <label>
            Geldt voor

            <select
              name="scope"
            >
              <option value="organization">
                Alleen deze onderneming
              </option>

              <option value="global">
                Alle ondernemingen
              </option>
            </select>
          </label>


          <label>
            Categorie

            <select
              name="category"
            >
              <option value="administration">
                Administratie
              </option>

              <option value="appointments">
                Afspraken
              </option>

              <option value="communication">
                Communicatie
              </option>

              <option value="tone">
                Tone of voice
              </option>

              <option value="knowledge">
                Kennis
              </option>

              <option value="safety">
                Veiligheid
              </option>

              <option value="other">
                Overig
              </option>
            </select>
          </label>


          <label>
            Regelcode

            <input
              name="ruleKey"
              maxlength="120"
              placeholder="bijv. documenten.shell"
              required
            >
          </label>


          <label>
            Titel

            <input
              name="title"
              maxlength="200"
              placeholder="Bijv. Shell-bonnen"
              required
            >
          </label>


          <label data-mode-label>
            Gedrag

            <select
              name="mode"
            >
              <option value="add">
                Toevoegen
              </option>

              <option value="override">
                Algemene regel overschrijven
              </option>

              <option value="deny">
                Verbieden
              </option>
            </select>
          </label>


          <label>
            Prioriteit

            <input
              name="priority"
              type="number"
              min="1"
              max="10000"
              value="100"
              required
            >
          </label>

        </div>


        <label>
          Wat moet Wize weten of doen?

          <textarea
            name="instruction"
            maxlength="10000"
            rows="5"
            placeholder="Bijvoorbeeld: bij betalingen aan Shell moet altijd een bon aanwezig zijn. Vraag vriendelijk om de bon als die ontbreekt."
            required
          ></textarea>
        </label>


        <label class="wize-inline-check">
          <input
            type="checkbox"
            name="enabled"
            checked
          >

          <span>
            Regel direct actief maken
          </span>
        </label>


        <div class="customer-buttons">
          <button
            type="submit"
            class="primary"
          >
            Regel opslaan
          </button>
        </div>

      </form>
    `;


    const form =
      target.querySelector(
        "[data-rule-form]"
      );

    const modeLabel =
      target.querySelector(
        "[data-mode-label]"
      );


    function syncScope() {
      modeLabel.hidden =
        form.elements.scope
          .value ===
        "global";
    }


    form.elements.scope
      .onchange =
        syncScope;

    syncScope();


    form.onsubmit =
      async event => {
        event.preventDefault();

        if (
          busy
        ) {
          return;
        }

        busy = true;
        error("");
        status(
          "Regel opslaan..."
        );


        const data =
          new FormData(
            form
          );

        const scope =
          data.get(
            "scope"
          );

        try {
          if (
            scope ===
            "global"
          ) {
            await api(
              "/api/wize-admin",
              {
                action:
                  "saveGlobalRule",

                ruleKey:
                  data.get(
                    "ruleKey"
                  ),

                category:
                  data.get(
                    "category"
                  ),

                title:
                  data.get(
                    "title"
                  ),

                instruction:
                  data.get(
                    "instruction"
                  ),

                priority:
                  Number(
                    data.get(
                      "priority"
                    )
                  ),

                enabled:
                  data.get(
                    "enabled"
                  ) ===
                  "on",
              }
            );
          } else {
            await api(
              "/api/wize-admin",
              {
                action:
                  "saveOrganizationRule",

                organizationId:
                  selectedOrganizationId,

                ruleKey:
                  data.get(
                    "ruleKey"
                  ),

                category:
                  data.get(
                    "category"
                  ),

                title:
                  data.get(
                    "title"
                  ),

                instruction:
                  data.get(
                    "instruction"
                  ),

                mode:
                  data.get(
                    "mode"
                  ),

                priority:
                  Number(
                    data.get(
                      "priority"
                    )
                  ),

                enabled:
                  data.get(
                    "enabled"
                  ) ===
                  "on",
              }
            );
          }

          form.reset();

          form.elements.priority
            .value =
            "100";

          form.elements.enabled
            .checked =
            true;

          syncScope();

          await loadPolicy();

          status(
            "Wize-regel opgeslagen."
          );
        } catch (
          caughtError
        ) {
          error(
            caughtError.message
          );

          status("");
        } finally {
          busy = false;
        }
      };
  }


  function renderAll() {
    renderSecurity();
    renderCapabilities();
    renderAppointments();
    renderActivity();
    renderRules();
    renderAddRule();
  }


  async function loadPolicy() {
    if (
      !selectedOrganizationId
    ) {
      root.innerHTML = `
        <section class="panel">
          <h2>
            Geen onderneming beschikbaar
          </h2>

          <p>
            Voeg eerst een onderneming toe.
          </p>
        </section>
      `;

      return;
    }

    error("");
    status(
      "Wize-instellingen laden..."
    );

    try {
      const data =
        await api(
          `/api/wize-admin?organizationId=${encodeURIComponent(
            selectedOrganizationId
          )}`
        );

      policy =
        data.policy;

      appointmentStatus =
        data.appointmentStatus ??
        null;

      activity =
        data.activity
          ?.items ??
        [];

      renderAll();

      status("");
    } catch (
      caughtError
    ) {
      error(
        caughtError.message
      );

      status("");
    }
  }


  organizationSelect.onchange =
    async event => {
      selectedOrganizationId =
        event.target.value;

      await loadPolicy();
    };


  await loadPolicy();
}
