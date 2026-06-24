/* Open Creator Rails docs viewer — dependency-free markdown renderer + hash router.
   Paths are relative to this file's directory (docs/). Root docs use "../". */
(function () {
  "use strict";

  var docEl = document.getElementById("doc");
  var navEl = document.getElementById("nav");
  var NAV = null;

  // ---- path helpers --------------------------------------------------------
  function normalize(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === "" || p === ".") continue;
      if (p === "..") {
        if (out.length && out[out.length - 1] !== "..") out.pop();
        else out.push("..");
      } else out.push(p);
    }
    return out;
  }
  // Resolve `target` relative to the directory of `fromDoc`.
  function resolvePath(fromDoc, target) {
    var baseDir = fromDoc.split("/").slice(0, -1);
    return normalize(baseDir.concat(target.split("/"))).join("/");
  }
  function isExternal(href) {
    return /^[a-z]+:\/\//i.test(href) || href.indexOf("mailto:") === 0;
  }

  // ---- escaping ------------------------------------------------------------
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---- inline markdown -----------------------------------------------------
  function inline(text, fromDoc) {
    // text is raw (unescaped) markdown for one logical line/cell
    var codes = [];
    // protect inline code spans first
    text = text.replace(/`([^`]+)`/g, function (_, c) {
      codes.push("<code>" + esc(c) + "</code>");
      return "\u0000" + (codes.length - 1) + "\u0000";
    });
    text = esc(text);
    // images
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, src) {
      var href = isExternal(src) || src.charAt(0) === "#" ? src : resolvePath(fromDoc, src);
      return '<img alt="' + alt + '" src="' + href + '" />';
    });
    // links
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
      if (isExternal(href)) {
        return '<a href="' + href + '" target="_blank" rel="noopener">' + label + "</a>";
      }
      if (href.charAt(0) === "#") {
        // in-page anchor (rare here) — leave as-is
        return '<a href="' + href + '">' + label + "</a>";
      }
      var hashIdx = href.indexOf("#");
      if (hashIdx >= 0) href = href.slice(0, hashIdx);
      var resolved = href ? resolvePath(fromDoc, href) : fromDoc;
      return '<a href="#' + resolved + '">' + label + "</a>";
    });
    // bold then italic
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");
    text = text.replace(/(^|[^a-zA-Z0-9_])_([^_\s][^_]*?)_(?![a-zA-Z0-9])/g, "$1<em>$2</em>");
    // restore code
    text = text.replace(/\u0000(\d+)\u0000/g, function (_, i) { return codes[+i]; });
    return text;
  }

  // ---- block markdown ------------------------------------------------------
  function render(md, fromDoc) {
    var lines = md.replace(/\r\n/g, "\n").split("\n");
    var html = [];
    var i = 0;

    function isTableSep(s) { return /^\s*\|?[\s:|-]*-{1,}[\s:|-]*\|?\s*$/.test(s) && s.indexOf("-") >= 0; }
    function splitRow(s) {
      var t = s.trim().replace(/^\|/, "").replace(/\|$/, "");
      return t.split("|").map(function (c) { return c.trim(); });
    }

    while (i < lines.length) {
      var line = lines[i];

      // blank
      if (/^\s*$/.test(line)) { i++; continue; }

      // fenced code
      var fence = line.match(/^```\s*(.*)$/);
      if (fence) {
        var lang = fence[1].trim().replace(/[^a-zA-Z0-9_-]/g, "");
        var buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // closing fence
        html.push('<pre><code' + (lang ? ' class="lang-' + lang + '"' : "") + ">" + esc(buf.join("\n")) + "</code></pre>");
        continue;
      }

      // heading
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lvl = h[1].length;
        html.push("<h" + lvl + ">" + inline(h[2].trim(), fromDoc) + "</h" + lvl + ">");
        i++;
        continue;
      }

      // hr
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { html.push("<hr />"); i++; continue; }

      // table
      if (line.indexOf("|") >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var headers = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf("|") >= 0 && !/^\s*$/.test(lines[i])) {
          rows.push(splitRow(lines[i])); i++;
        }
        var t = "<table><thead><tr>";
        headers.forEach(function (c) { t += "<th>" + inline(c, fromDoc) + "</th>"; });
        t += "</tr></thead><tbody>";
        rows.forEach(function (r) {
          t += "<tr>";
          for (var c = 0; c < headers.length; c++) t += "<td>" + inline(r[c] || "", fromDoc) + "</td>";
          t += "</tr>";
        });
        t += "</tbody></table>";
        html.push(t);
        continue;
      }

      // blockquote
      if (/^\s*>/.test(line)) {
        var qbuf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          qbuf.push(lines[i].replace(/^\s*>\s?/, "")); i++;
        }
        html.push("<blockquote>" + render(qbuf.join("\n"), fromDoc) + "</blockquote>");
        continue;
      }

      // list (handles nesting by indentation)
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        var listResult = parseList(lines, i, fromDoc);
        html.push(listResult.html);
        i = listResult.next;
        continue;
      }

      // paragraph
      var pbuf = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i]) &&
             !/^\s*>/.test(lines[i]) && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
             !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) {
        pbuf.push(lines[i]); i++;
      }
      if (pbuf.length) html.push("<p>" + inline(pbuf.join(" "), fromDoc) + "</p>");
    }
    return html.join("\n");
  }

  function indentOf(s) { var m = s.match(/^(\s*)/); return m[1].replace(/\t/g, "  ").length; }

  function parseList(lines, start, fromDoc) {
    var baseIndent = indentOf(lines[start]);
    var ordered = /^\s*\d+\.\s+/.test(lines[start]);
    var items = [];
    var i = start;
    while (i < lines.length) {
      var ln = lines[i];
      if (/^\s*$/.test(ln)) {
        // allow a single blank line inside list if next line is still a list item at >= baseIndent
        if (i + 1 < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i + 1]) && indentOf(lines[i + 1]) >= baseIndent) { i++; continue; }
        break;
      }
      var ind = indentOf(ln);
      var m = ln.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
      if (!m || ind < baseIndent) break;
      if (ind > baseIndent) {
        // nested list belongs to previous item
        var nested = parseList(lines, i, fromDoc);
        if (items.length) items[items.length - 1].sub += nested.html;
        i = nested.next;
        continue;
      }
      items.push({ text: m[2], sub: "" });
      i++;
    }
    var tag = ordered ? "ol" : "ul";
    var out = "<" + tag + ">";
    items.forEach(function (it) { out += "<li>" + inline(it.text, fromDoc) + it.sub + "</li>"; });
    out += "</" + tag + ">";
    return { html: out, next: i };
  }

  // ---- citation annotation -------------------------------------------------
  // Wraps source citations like (Asset.sol:202-204) in <span class="citation">
  // so they can be styled down visually while remaining in the DOM for tooling.
  var CITATION_RE = /(\([A-Za-z][A-Za-z0-9./]*\.[a-z]+:[0-9][0-9,\s-]*\))/g;

  function annotateCitations(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        while (p && p !== el) {
          if (p.tagName === "CODE" || p.tagName === "PRE") return NodeFilter.FILTER_REJECT;
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }, false);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      CITATION_RE.lastIndex = 0;
      if (!CITATION_RE.test(node.nodeValue)) return;
      CITATION_RE.lastIndex = 0;
      var frag = document.createDocumentFragment();
      var text = node.nodeValue;
      var last = 0, m;
      while ((m = CITATION_RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var span = document.createElement("span");
        span.className = "citation";
        span.textContent = m[0];
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  // ---- navigation ----------------------------------------------------------
  function buildNav() {
    var html = "";
    NAV.sections.forEach(function (sec) {
      html += '<div class="nav-section"><div class="nav-section-title">' + esc(sec.title) + "</div>";
      sec.items.forEach(function (it) {
        html += '<a class="nav-link" data-path="' + it.path + '" href="#' + it.path + '">' + esc(it.label) + "</a>";
      });
      html += "</div>";
    });
    navEl.innerHTML = html;
  }

  function setActive(path) {
    var links = navEl.querySelectorAll(".nav-link");
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle("active", links[i].getAttribute("data-path") === path);
    }
  }

  // ---- routing -------------------------------------------------------------
  function currentPath() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ""));
    return h || (NAV && NAV.default) || "index.md";
  }

  function load(path) {
    docEl.innerHTML = "Loading…";
    fetch(path, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (md) {
        docEl.innerHTML = render(md, path);
        annotateCitations(docEl);
        setActive(path);
        document.body.classList.remove("nav-open");
        window.scrollTo(0, 0);
        // adjust in-page anchor links if any after render (none expected)
      })
      .catch(function (e) {
        docEl.innerHTML = '<div class="doc-error"><strong>Could not load</strong> <code>' +
          esc(path) + "</code>: " + esc(e.message) +
          ".<br/>If you opened this file directly, run a static server from the repository root " +
          "(e.g. <code>python3 -m http.server</code>) and open <code>/docs/</code>.</div>";
        setActive(path);
      });
  }

  function route() { load(currentPath()); }

  // ---- boot ----------------------------------------------------------------
  fetch("nav.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (nav) {
      NAV = nav;
      document.getElementById("brand-title").textContent = nav.title || "Documentation";
      document.getElementById("brand-subtitle").textContent = nav.subtitle || "";
      buildNav();
      window.addEventListener("hashchange", route);
      route();
    })
    .catch(function (e) {
      docEl.innerHTML = '<div class="doc-error">Failed to load <code>nav.json</code>: ' + esc(e.message) +
        ". Serve this folder over HTTP rather than opening the file directly.</div>";
    });

  var toggle = document.getElementById("menu-toggle");
  if (toggle) toggle.addEventListener("click", function () { document.body.classList.toggle("nav-open"); });
})();
