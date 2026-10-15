const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export async function mountWizeOffice(root,api,data){
  const organizations=data?.organizations??[];
  let currentChatId=null;
  let currentMessages=[];
  let busy=false;

  root.innerHTML=`
    <section class="wize-office-shell wize-office-shell--assistant">
      <aside class="wize-office-sidebar">
        <div class="wize-office-brand">
          <span class="wize-office-mark">W</span>
          <div><strong>Wize Office</strong><small>Interne assistent · alleen Bestemd</small></div>
        </div>

        <button id="wize-new-chat" class="primary wize-new-chat" type="button">+ Nieuwe chat</button>

        <label class="wize-office-company">
          <span>Onderneming</span>
          <select id="wize-office-organization">
            <option value="">Kies een onderneming</option>
            ${organizations.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}
          </select>
        </label>

        <div class="wize-chat-history">
          <div class="wize-chat-history-head"><span>Chats</span></div>
          <div id="wize-chat-list" class="wize-chat-list"></div>
        </div>

        <div class="wize-office-info">
          <strong>Privé voor jouw Office-account</strong>
          <p>Chats worden server-side bewaard. Een klantaccount kan deze gesprekken niet openen.</p>
        </div>
      </aside>

      <div class="wize-office-chat">
        <header class="wize-office-chat-head">
          <div>
            <p class="eyebrow">BESTEMD AI</p>
            <h2 id="wize-chat-title">Nieuwe chat</h2>
            <p id="wize-chat-company">Kies een onderneming en stel Wize een vraag.</p>
          </div>
          <button id="wize-delete-chat" class="text-button" type="button" hidden>Chat verwijderen</button>
        </header>

        <div id="wize-office-messages" class="wize-office-messages"></div>

        <div id="wize-office-suggestions" class="wize-office-suggestions">
          <button type="button">Wat is de financiële situatie?</button>
          <button type="button">Hoeveel staat er open bij klanten?</button>
          <button type="button">Wat moet er nog naar leveranciers?</button>
          <button type="button">Hoe staat het met de bank?</button>
        </div>

        <form id="wize-office-form" class="wize-office-composer">
          <textarea id="wize-office-input" rows="1" maxlength="3000" placeholder="Stel Wize een vraag..."></textarea>
          <button type="submit" class="primary">Versturen</button>
        </form>
        <p id="wize-office-error" class="wize-office-error" role="alert"></p>
      </div>
    </section>
  `;

  const select=root.querySelector("#wize-office-organization");
  const list=root.querySelector("#wize-chat-list");
  const messages=root.querySelector("#wize-office-messages");
  const title=root.querySelector("#wize-chat-title");
  const company=root.querySelector("#wize-chat-company");
  const form=root.querySelector("#wize-office-form");
  const input=root.querySelector("#wize-office-input");
  const error=root.querySelector("#wize-office-error");
  const newButton=root.querySelector("#wize-new-chat");
  const deleteButton=root.querySelector("#wize-delete-chat");

  function welcome(text="Kies een onderneming en stel Wize een vraag."){
    messages.innerHTML=`<div class="wize-office-message assistant"><div class="wize-office-avatar">W</div><div class="wize-office-bubble"><strong>Wize</strong><p>${esc(text)}</p></div></div>`;
  }

  function addMessage(role,body){
    const el=document.createElement("div");
    el.className=`wize-office-message ${role}`;
    el.innerHTML=role==="assistant"
      ?`<div class="wize-office-avatar">W</div><div class="wize-office-bubble"><strong>Wize</strong><p>${esc(body)}</p></div>`
      :`<div class="wize-office-bubble"><strong>Jij</strong><p>${esc(body)}</p></div>`;
    messages.append(el);
    messages.scrollTop=messages.scrollHeight;
  }

  async function refreshChats(){
    const result=await api("/api/wize-office/history");
    const chats=result.chats??[];
    list.innerHTML=chats.length?"":"<p class=\"muted wize-no-chats\">Nog geen chats.</p>";
    for(const chat of chats){
      const button=document.createElement("button");
      button.type="button";
      button.className="wize-chat-item"+(chat.id===currentChatId?" active":"");
      button.innerHTML=`<span>${esc(chat.title)}</span><small>${esc(chat.organizationName??"")}</small>`;
      button.onclick=()=>loadChat(chat.id);
      list.append(button);
    }
  }

  async function loadChat(id){
    if(busy)return;
    error.textContent="";
    const result=await api("/api/wize-office/history?chatId="+encodeURIComponent(id));
    currentChatId=result.chat.id;
    currentMessages=result.messages??[];
    title.textContent=result.chat.title;
    company.textContent=result.chat.organizationName??"";
    select.value=result.chat.organizationId??"";
    select.disabled=true;
    deleteButton.hidden=false;
    messages.innerHTML="";
    if(!currentMessages.length)welcome("Deze chat is nog leeg. Waar kan ik mee helpen?");
    else for(const message of currentMessages)addMessage(message.role,message.content);
    await refreshChats();
    input.focus();
  }

  function startNewChat(){
    currentChatId=null;
    currentMessages=[];
    title.textContent="Nieuwe chat";
    company.textContent="Kies een onderneming en stel Wize een vraag.";
    select.value="";
    select.disabled=false;
    deleteButton.hidden=true;
    error.textContent="";
    welcome();
    refreshChats().catch(()=>{});
    input.focus();
  }

  async function ensureChat(){
    if(currentChatId)return currentChatId;
    if(!select.value)throw new Error("Kies eerst een onderneming.");
    const result=await api("/api/wize-office/history",{action:"new",organizationId:select.value});
    currentChatId=result.chat.id;
    select.disabled=true;
    deleteButton.hidden=false;
    return currentChatId;
  }

  async function append(role,content){
    const result=await api("/api/wize-office/history",{action:"append",chatId:currentChatId,role,content});
    if(result.chat?.title){
      title.textContent=result.chat.title;
    }
    currentMessages.push({role,content});
  }

  async function ask(question){
    const clean=String(question??"").trim();
    if(!clean||busy)return;
    busy=true;
    error.textContent="";
    input.disabled=true;
    form.querySelector("button").disabled=true;

    try{
      await ensureChat();
      addMessage("user",clean);
      await append("user",clean);
      input.value="";

      const thinking=document.createElement("div");
      thinking.className="wize-office-message assistant thinking";
      thinking.innerHTML='<div class="wize-office-avatar">W</div><div class="wize-office-bubble"><strong>Wize</strong><p>Ik kijk even mee…</p></div>';
      messages.append(thinking);
      messages.scrollTop=messages.scrollHeight;

      const result=await api("/api/wize-office",{
        organizationId:select.value,
        question:clean,
        history:currentMessages.slice(-8)
      });

      thinking.remove();
      addMessage("assistant",result.answer);
      await append("assistant",result.answer);
      company.textContent=result.organization?.name??select.options[select.selectedIndex]?.textContent??"";
      await refreshChats();
    }catch(caught){
      root.querySelector(".thinking")?.remove();
      error.textContent=caught instanceof Error?caught.message:"Wize Office is tijdelijk niet beschikbaar.";
    }finally{
      busy=false;
      input.disabled=false;
      form.querySelector("button").disabled=false;
      input.focus();
    }
  }

  form.onsubmit=event=>{event.preventDefault();void ask(input.value);};
  input.onkeydown=event=>{
    if(event.key==="Enter"&&!event.shiftKey){
      event.preventDefault();
      form.requestSubmit();
    }
  };
  newButton.onclick=startNewChat;
  deleteButton.onclick=async()=>{
    if(!currentChatId||busy)return;
    if(!confirm("Deze chat verwijderen?"))return;
    await api("/api/wize-office/history",{action:"delete",chatId:currentChatId});
    startNewChat();
    await refreshChats();
  };
  root.querySelectorAll("#wize-office-suggestions button").forEach(button=>button.onclick=()=>void ask(button.textContent));

  welcome();
  try{await refreshChats();}catch(caught){error.textContent=caught instanceof Error?caught.message:"Chats konden niet worden geladen.";}
}
