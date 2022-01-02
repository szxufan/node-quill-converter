function mention(Quill) {
  const Embed = Quill.import("blots/embed");
  class MentionBlot extends Embed {
    static create(data) {
      const node = super.create();
      node.addEventListener('click', (e) => {
        const event = new Event('mention-clicked', {bubbles: true, cancelable: true});
        event.value = data;
        event.event = e;
        window.dispatchEvent(event);
        e.preventDefault();
      }, false);
      const denotationChar = document.createElement("span");
      denotationChar.className = "ql-mention-denotation-char";
      denotationChar.innerHTML = data.denotationChar;
      node.appendChild(denotationChar);
      node.innerHTML += data.value;
      return MentionBlot.setDataValues(node, data);
    }

    static setDataValues(element, data) {
      const domNode = element;
      Object.keys(data).forEach(key => {
        domNode.dataset[key] = data[key];
      });
      return domNode;
    }

    static value(domNode) {
      return domNode.dataset;
    }
  }

  MentionBlot.blotName = "mention";
  MentionBlot.tagName = "span";
  MentionBlot.className = "mention";

  Quill.register(MentionBlot);
}

module.exports = { mention };