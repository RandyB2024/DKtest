export class MockMicrosoftGraphService{async importMessage(){return {externalMessageId:`mock-${Date.now()}`,externalThreadId:`mock-thread-${Date.now()}`,channel:'Outlook',mock:true}}}
