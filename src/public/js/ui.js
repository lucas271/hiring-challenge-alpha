

export function addMessage(user, text, isError) {
  const messagesContainer = document.querySelector('#messages');

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';

  const senderSpan = document.createElement('span');
  senderSpan.className = 'sender';
  senderSpan.textContent = user + ':';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  //Add classes that changes the background color of the messageDiv based on the user and isError data
  if (isError) {
    messageDiv.classList.add('error');
  } else if (user === 'You') {
    messageDiv.classList.add('user-message');
  } else if (user === 'AI') {
    messageDiv.classList.add('ai-message');
  }


  if (window.marked) {
    contentDiv.innerHTML = window.marked.parse(text);
  } else {
    contentDiv.textContent = text;
  }

  messageDiv.appendChild(senderSpan);
  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
