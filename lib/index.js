const fs = require("fs");
const path = require("path");
const urlib = require("url");
const mime = require("mime");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { mention } = require("./mention");

let quillFilePath = require.resolve("quill");
let quillMinFilePath = quillFilePath.replace("quill.js", "quill.min.js");

let quillLibrary = fs.readFileSync(quillMinFilePath);
let mutationObserverPolyfill = fs.readFileSync(
  path.join(__dirname, "polyfill.js")
);

function escape(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;");
}

function unescape(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const JSDOM_TEMPLATE = `
  <div id="editor">hello</div>
  <script>${mutationObserverPolyfill}</script>
  <script>${quillLibrary}</script>
  <script>
    document.getSelection = function() {
      return {
        getRangeAt: function() { }
      };
    };
    document.execCommand = function (command, showUI, value) {
      try {
          return document.execCommand(command, showUI, value);
      } catch(e) {}
      return false;
    };
  </script>
`;

class CustomResourceLoader extends jsdom.ResourceLoader {
  fetch(url, options) {
    if (url.startsWith("http")) {
      return "";
    }
    return super.fetch(url, options);
  }
}
const customResourceLoader = new CustomResourceLoader({});

const JSDOM_OPTIONS = {
  runScripts: "dangerously",
  resources: customResourceLoader,
};
const DOM = new JSDOM(JSDOM_TEMPLATE, JSDOM_OPTIONS);

const cache = {};

exports.convertTextToDelta = (text) => {
  if (!cache.quill) {
    mention(DOM.window.Quill);
    cache.quill = new DOM.window.Quill("#editor");
  }

  cache.quill.setText(text);
  return cache.quill.getContents();
};

const imageType = { jpg: null, jpeg: null, png: null };
const videoType = {
  mp4: null,
  mkv: null,
  rmvb: null,
  avi: null,
  mov: null,
  rm: null,
  wmv: null,
};

exports.convertHtmlToDelta = (html) => {
  if (!cache.quill) {
    mention(DOM.window.Quill);
    cache.quill = new DOM.window.Quill("#editor");
  }
  const ret = cache.quill.clipboard.convert(html);
  return ret.map((op) => {
    if (
      typeof op.insert === "object" &&
      op.insert !== null &&
      "image" in op.insert &&
      op.insert.image.startsWith("http")
    ) {
      const imageUrl = urlib.parse(op.insert.image, true);
      let sImageUrl = imageUrl.pathname.split(".");
      if (!(sImageUrl[sImageUrl.length - 1] in imageType)) {
        if (sImageUrl[sImageUrl.length - 1] in videoType) {
          op = {
            insert: {
              video: op.insert.image,
            },
          };
        } else {
          sImageUrl = imageUrl.pathname.split("/");
          const fileName = sImageUrl[sImageUrl.length - 1];
          const fileType = mime.getType(fileName);
          op = {
            attributes: { size: "" },
            insert: {
              fileBlot: {
                href: op.insert.image,
                fileName,
                fileSize: null,
                fileType,
              },
            },
          };
        }
      }
    }
    return op;
  });
};

exports.convertDeltaToHtml = (delta) => {
  let ret = "";
  if ("ops" in delta) delta = delta.ops;
  for (let i = 0; i < delta.length; i++) {
    const op = delta[i];
    if (typeof op.insert === "object" && op.insert !== null) {
      if ("fileBlot" in op.insert) {
        ret += `<img src="${encodeURI(op.insert.fileBlot.href)}">`;
      } else if ("mention" in op.insert) {
        ret += `<span class="mention" data-index="${op.insert.mention.index}" data-denotation-char="${op.insert.mention.denotationChar}" data-id="${op.insert.mention.id}" data-value="${op.insert.mention.value}" data-key="${op.insert.mention.key}">`;
      } else if ("image" in op.insert) {
        ret += `<img src="${encodeURI(op.insert.image)}">`;
      } else if ("video" in op.insert) {
        ret += `<video src="${encodeURI(op.insert.video)}">`;
      }
    } else if (typeof op.insert === "string") {
      op.insert = escape(op.insert);
      if ("attributes" in op) {
        if (op.attributes.strike) {
          op.insert = `<s>${op.insert}</s>`;
        }
        if (op.attributes.bold) {
          if (op.attributes.color) {
            op.insert = `<strong style="color: rgb(${parseInt(
              op.attributes.color.slice(1, 3),
              16
            )}, ${parseInt(op.attributes.color.slice(3, 5), 16)}, ${parseInt(
              op.attributes.color.slice(5, 7),
              16
            )});">${op.insert.replace("\n", "<br>")}</strong>`;
          } else {
            op.insert = `<strong>${op.insert.replace("\n", "<br>")}</strong>`;
          }
        } else {
          if (op.attributes.color) {
            op.insert = `<span style="color: rgb(${parseInt(
              op.attributes.color.slice(1, 3),
              16
            )}, ${parseInt(op.attributes.color.slice(3, 5), 16)}, ${parseInt(
              op.attributes.color.slice(5, 7),
              16
            )});">${op.insert.replace("\n", "<br>")}</span>`;
          } else {
            op.insert = op.insert.replace("\n", "<br>");
          }
        }
        if ("link" in op.attributes) {
          op.insert = `<a herf="${op.attributes.link}">${op.insert}</a>`;
        }
        ret += op.insert;
      } else {
        ret += op.insert.replace(/\n/g, "<br>");
      }
    }
  }
  return ret;
};

exports.convertDeltaToHtmlWithoutFileBlot = (delta) => {
  let ret = "";
  if ("ops" in delta) delta = delta.ops;
  for (let i = 0; i < delta.length; i++) {
    const op = delta[i];
    if (typeof op.insert === "object" && op.insert !== null) {
      if ("image" in op.insert) {
        ret += `<img src="${encodeURI(op.insert.image.split("?")[0])}">`;
      } else if ("video" in op.insert) {
        ret += `<video src="${encodeURI(op.insert.video.split("?")[0])}">`;
      }
    } else if (typeof op.insert === "string") {
      op.insert = escape(op.insert);
      if ("attributes" in op) {
        if (op.attributes.strike) {
          op.insert = `<s>${op.insert}</s>`;
        }
        if (op.attributes.bold) {
          if (op.attributes.color) {
            op.insert = `<strong style="color: rgb(${parseInt(
              op.attributes.color.slice(1, 3),
              16
            )}, ${parseInt(op.attributes.color.slice(3, 5), 16)}, ${parseInt(
              op.attributes.color.slice(5, 7),
              16
            )});">${op.insert.replace("\n", "<br>")}</strong>`;
          } else {
            op.insert = `<strong>${op.insert.replace("\n", "<br>")}</strong>`;
          }
        } else {
          if (op.attributes.color) {
            op.insert = `<span style="color: rgb(${parseInt(
              op.attributes.color.slice(1, 3),
              16
            )}, ${parseInt(op.attributes.color.slice(3, 5), 16)}, ${parseInt(
              op.attributes.color.slice(5, 7),
              16
            )});">${op.insert.replace("\n", "<br>")}</span>`;
          } else {
            op.insert = op.insert.replace("\n", "<br>");
          }
        }
        if ("link" in op.attributes) {
          op.insert = `<a herf="${op.attributes.link}">${op.insert}</a>`;
        }
        ret += op.insert;
      } else {
        ret += op.insert.replace(/\n/g, "<br>");
      }
    }
  }
  return ret;
};

exports.convertDeltaToText = (delta) => {
  return delta
    .slice()
    .map((op) => {
      if (typeof op.insert === "object" && op.insert !== null) {
        if ("image" in op.insert) {
          return `![${op.insert.image}]!`;
        } else if ("fileBlot" in op.insert) {
          return `![${op.insert.fileBlot.href}]!`;
        } else if ("mention" in op.insert) {
          return `@${op.insert.mention.value}`;
        } else if ("video" in op.insert) {
          return `![${op.insert.video}]!`;
        }
        return "";
      } else {
        return op.insert;
      }
    })
    .join("");
};

exports.convertDeltaToDeltaV2 = (delta) => {
  return delta.slice().map((op) => {
    if (typeof op.insert === "string") {
      op.insert = { text: op.insert };
    }
    return op;
  });
};

exports.convertDeltaV2ToDelta = (delta) => {
  if (delta === null) return [];
  return delta.slice().map((op) => {
    if (typeof op.insert?.text === "string") {
      op.insert = op.insert.text;
    }
    if (op.insert?.image === null) {
      delete op.insert.image;
    }
    return op;
  });
};

exports.convertDeltaToPureText = (delta) => {
  if (delta === null) return "";
  if ("ops" in delta) delta = delta.ops;
  delta = delta.filter((item) => {
    return !(item["insert"] === "\n");
  });
  try {
    return delta
      .slice()
      .map((op) => {
        if (typeof op.insert === "object" && op.insert !== null) {
          if ("mention" in op.insert) {
            return op.insert.mention.value;
          }
          return "";
        } else {
          return op.insert;
        }
      })
      .join("");
  } catch (e) {
    console.log(e);
    return "";
  }
};

exports.getImageFromDelta = (delta) => {
  return delta
    .slice()
    .map((op) =>
      typeof op.insert === "object" &&
      op.insert !== null &&
      "image" in op.insert
        ? op.insert.image
        : ""
    )
    .filter((op) => op.length > 0);
};

exports.getFileFromDelta = (delta) => {
  return delta
    .slice()
    .map((op) =>
      typeof op.insert === "object" &&
      op.insert !== null &&
      "fileBlot" in op.insert
        ? op.insert.fileBlot.href
        : ""
    )
    .filter((op) => op.length > 0);
};
