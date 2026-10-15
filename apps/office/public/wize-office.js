const escapeHtml =
  value =>
    String(value ?? "")
      .replace(
        /[&<>"']/g,
        c => ({
          "&":"&amp;",
          "<":"&lt;",
          ">":"&gt;",
          '"':"&quot;",
          "'":"&#39;",
        }[c])
      );


export async function mountWizeOffice(
  root,
  api,
  data
) {
  const organizations =
    data?.organizations ??
    [];

  root.innerHTML = `
    <section class="wize-office-shell">
      <aside class="wize-office-sidebar">
        <div class="wize-office-brand">
          <span class="wize-office-mark">W</span>
          <div>
            <strong>Wize Office</strong>
            <small>Interne assistent · alleen Bestemd</small>
          </div>
        </div>

        <label class="wize-office-company">
          <span>Onderneming</span>
          <select id="wize-office-organization">
            <option value="">Kies een onderneming</option>
            ${organizations
              .map(
                item =>
                  `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
              )
              .join("")}
          </select>
        </label>

        <div class="wize-office-info">
          <strong>Veilige Office-modus</strong>
          <p>
            Wize leest alleen de geselecteerde onderneming.
            Deze eerste versie voert geen acties uit.
          </p>
        </div>
      </aside>

      <div class="wize-office-chat">
        <header class="wize-office-chat-head">
          <div>
            <p class="eyebrow">BESTEMD AI</p>
            <h2>Waar kan ik mee helpen?</h2>
            <p>
              Vraag Wize naar cijfers, openstaande posten,
              bankmutaties, documenten of wat er bij een klant speelt.
            </p>
          </div>
        </header>

        <div id="wize-office-messages" class="wize-office-messages">
          <div class="wize-office-message assistant">
            <div class="wize-office-avatar">W</div>
            <div class="wize-office-bubble">
              <strong>Wize</strong>
              <p>
                Kies links eerst een onderneming. Daarna kan ik
                veilig met je meekijken binnen die administratie.
              </p>
            </div>
          </div>
        </div>

        <div class="wize-office-suggestions">
          <button type="button">Wat is de financiële situatie?</button>
          <button type="button">Welke posten staan nog open?</button>
          <button type="button">Hoe staat het met de bank?</button>
          <button type="button">Zijn er documenten die aandacht nodig hebben?</button>
        </div>

        <form id="wize-office-form" class="wize-office-composer">
          <textarea
            id="wize-office-input"
            rows="1"
            maxlength="3000"
            placeholder="Vraag Wize iets over de geselecteerde onderneming..."
          ></textarea>

          <button
            type="submit"
            class="primary"
          >
            Versturen
          </button>
        </form>

        <p
          id="wize-office-error"
          class="wize-office-error"
          role="alert"
        ></p>
      </div>
    </section>
  `;

  const select =
    root.querySelector(
      "#wize-office-organization"
    );

  const form =
    root.querySelector(
      "#wize-office-form"
    );

  const input =
    root.querySelector(
      "#wize-office-input"
    );

  const messages =
    root.querySelector(
      "#wize-office-messages"
    );

  const error =
    root.querySelector(
      "#wize-office-error"
    );

  let busy =
    false;

  function addMessage(
    role,
    body
  ) {
    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.className =
      `wize-office-message ${role}`;

    wrapper.innerHTML =
      role ===
      "assistant"
        ? `
          <div class="wize-office-avatar">W</div>
          <div class="wize-office-bubble">
            <strong>Wize</strong>
            <p>${escapeHtml(body)}</p>
          </div>
        `
        : `
          <div class="wize-office-bubble">
            <strong>Jij</strong>
            <p>${escapeHtml(body)}</p>
          </div>
        `;

    messages.append(
      wrapper
    );

    messages.scrollTop =
      messages.scrollHeight;
  }


  async function ask(
    question
  ) {
    const organizationId =
      select.value;

    const clean =
      question.trim();

    if (
      busy ||
      !clean
    ) {
      return;
    }

    if (
      !organizationId
    ) {
      error.textContent =
        "Kies eerst een onderneming.";
      return;
    }

    busy =
      true;

    error.textContent =
      "";

    input.disabled =
      true;

    form.querySelector(
      "button"
    ).disabled =
      true;

    addMessage(
      "user",
      clean
    );

    input.value =
      "";

    const thinking =
      document.createElement(
        "div"
      );

    thinking.className =
      "wize-office-message assistant thinking";

    thinking.innerHTML =
      `
        <div class="wize-office-avatar">W</div>
        <div class="wize-office-bubble">
          <strong>Wize</strong>
          <p>Ik kijk even mee…</p>
        </div>
      `;

    messages.append(
      thinking
    );

    messages.scrollTop =
      messages.scrollHeight;

    try {
      const result =
        await api(
          "/api/wize-office",
          {
            organizationId,
            question:
              clean,
          }
        );

      thinking.remove();

      addMessage(
        "assistant",
        result.answer
      );
    } catch (
      caught
    ) {
      thinking.remove();

      error.textContent =
        caught instanceof Error
          ? caught.message
          : "Wize Office is tijdelijk niet beschikbaar.";
    } finally {
      busy =
        false;

      input.disabled =
        false;

      form.querySelector(
        "button"
      ).disabled =
        false;

      input.focus();
    }
  }


  form.onsubmit =
    event => {
      event.preventDefault();

      void ask(
        input.value
      );
    };


  root
    .querySelectorAll(
      ".wize-office-suggestions button"
    )
    .forEach(
      button => {
        button.onclick =
          () =>
            void ask(
              button.textContent
            );
      }
    );


  select.onchange =
    () => {
      messages.innerHTML =
        "";

      const selected =
        organizations.find(
          item =>
            item.id ===
            select.value
        );

      addMessage(
        "assistant",
        selected
          ? `Ik kijk nu alleen mee binnen ${selected.name}. Wat wil je weten?`
          : "Kies eerst een onderneming."
      );

      error.textContent =
        "";
    };
}
