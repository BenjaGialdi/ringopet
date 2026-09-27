/**
 * La Store API devuelve nombres y textos con entidades HTML escapadas
 * ("&#8211;", "&amp;"...). Para mostrarlos como texto plano (fuera de
 * set:html) hay que decodificarlas primero.
 */
const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (coincidencia, cuerpo) => {
    if (cuerpo[0] === '#') {
      const codigo = cuerpo[1] === 'x' || cuerpo[1] === 'X' ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
      return Number.isNaN(codigo) ? coincidencia : String.fromCodePoint(codigo);
    }
    return ENTIDADES[cuerpo] ?? coincidencia;
  });
}
