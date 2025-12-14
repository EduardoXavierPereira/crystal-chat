describe('Crystal Chat', () => {
  const visitApp = () => {
    cy.visit('/renderer/e2e.html', {
      onBeforeLoad(win) {
        try {
          win.localStorage.clear();
        } catch {
          // ignore
        }
        try {
          win.indexedDB.deleteDatabase('crystal-chat');
        } catch {
          // ignore
        }
      }
    });
    cy.get('#setup-modal', { timeout: 20000 }).should('have.class', 'hidden');
  };

  const sendPrompt = (text) => {
    cy.get('#prompt-input').should('be.visible').clear().type(text);
    cy.get('#prompt-form').submit();
  };

  beforeEach(() => {
    // isolate from previous runs (done via onBeforeLoad)
  });

  it('sends a prompt and receives an assistant response', () => {
    visitApp();

    const prompt = 'Hello from Cypress';
    sendPrompt(prompt);

    cy.get('#messages .message.user .message-content').contains(prompt);
    cy.get('#messages .message.assistant .message-content', { timeout: 10000 })
      .contains(`Echo: ${prompt}`);
  });

  it('switches chats and persists them after reload', () => {
    visitApp();

    const promptA = 'Chat A prompt';
    sendPrompt(promptA);
    cy.get('#messages .message.assistant .message-content', { timeout: 10000 })
      .contains(`Echo: ${promptA}`);

    // Create a new chat
    cy.get('#new-chat').click();
    const promptB = 'Chat B prompt';
    sendPrompt(promptB);
    cy.get('#messages .message.assistant .message-content', { timeout: 10000 })
      .contains(`Echo: ${promptB}`);

    // There should be 2 chats in the sidebar
    cy.get('#chat-list .chat-item').should('have.length.at.least', 2);

    // Click the second chat (older one)
    cy.get('#chat-list .chat-item').eq(1).click();
    cy.get('#messages .message.user .message-content').contains(promptA);

    // Reload and verify persistence (IndexedDB + UI state)
    cy.reload();
    cy.get('#setup-modal', { timeout: 20000 }).should('have.class', 'hidden');

    // Chat list should still exist
    cy.get('#chat-list .chat-item').should('have.length.at.least', 2);

    // Open the other chat and verify its content
    cy.get('#chat-list .chat-item').first().click();
    cy.get('#messages .message.user .message-content').contains(promptB);
  });
});
