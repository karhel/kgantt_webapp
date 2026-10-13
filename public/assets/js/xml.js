// Lecteur XML minimal (éléments, attributs, texte, CDATA), utilisable dans le
// navigateur comme dans Node. Suffisant pour les fichiers GanttProject (.gan).

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/**
 * @returns {{ name: string, attrs: Object, children: Array, text: string }} élément racine
 */
export function parseXML(src) {
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { top().text += decodeEntities(src.slice(i)); break; }
    if (lt > i) top().text += decodeEntities(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('Commentaire XML non fermé');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end === -1) throw new Error('Section CDATA non fermée');
      top().text += src.slice(lt + 9, end);
      i = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end === -1) throw new Error('Instruction XML non fermée');
      i = end + 2;
    } else if (src.startsWith('<!', lt)) {
      const end = src.indexOf('>', lt + 2);
      if (end === -1) throw new Error('Déclaration XML non fermée');
      i = end + 1;
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt + 2);
      if (end === -1) throw new Error('Balise fermante incomplète');
      const name = src.slice(lt + 2, end).trim();
      if (top().name !== name) throw new Error(`Balise </${name}> inattendue`);
      stack.pop();
      i = end + 1;
    } else {
      // Balise ouvrante : on cherche le ">" en ignorant ceux des valeurs d'attributs.
      let j = lt + 1, quote = null;
      while (j < n) {
        const c = src[j];
        if (quote) { if (c === quote) quote = null; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break;
        j++;
      }
      if (j >= n) throw new Error('Balise ouvrante incomplète');
      let body = src.slice(lt + 1, j);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const m = /^([^\s/>]+)/.exec(body);
      if (!m) throw new Error('Nom de balise manquant');
      const el = { name: m[1], attrs: {}, children: [], text: '' };
      const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = re.exec(body.slice(m[1].length)))) el.attrs[a[1]] = decodeEntities(a[3] ?? a[4]);
      top().children.push(el);
      if (!selfClosing) stack.push(el);
      i = j + 1;
    }
  }
  if (stack.length !== 1) throw new Error(`Balise <${top().name}> non fermée`);
  return root.children[0] || null;
}

export const childrenNamed = (el, name) => (el?.children || []).filter((c) => c.name === name);
export const childNamed = (el, name) => (el?.children || []).find((c) => c.name === name) || null;
