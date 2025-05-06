import { addMessage } from './ui.js';

export function setupSocket() {
  const language = prompt("Please select your language/Por favor escolha sua linguagem");
  const socket = new WebSocket(`ws://${window.location.host}/api/v1/talkAi/${language}`);

  socket.addEventListener('message', (event) => {
    const data = event.data;

    try {
      addMessage('AI', data);
    } catch (e) {
      console.log(e)
      addMessage('System', "Unable to read server response.", true);
    }
  });

  socket.addEventListener('close', () => {
    addMessage('System', 'Connection closed. Please refresh the page.', true);
  });
  
  socket.addEventListener('error', () => {
    addMessage('System', 'Connection error. Please refresh the page.', true);
  });

  handleSend(socket);

  return socket;
}

const handleSend = (socket) => {
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  
  const sendMessage = () => {
    const message = messageInput.value.trim();
    if (message) {
      socket.send(message);
      addMessage('You', message);
      messageInput.value = '';
    }
  };

  sendButton.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      sendMessage();
    }
  });
};