const fs = require('fs-extra');

// Regex robusta para capturar diferentes tipos de declaraciones de funciones
const FN_REGEX = /(?:async\s*)?function\s+([a-zA-Z0-9_$]+)\s*\(|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?function|([a-zA-Z0-9_$]+)\s*:\s*(?:async\s*)?function|([a-zA-Z0-9_$]+)\s*:\s*(?:async\s*)?\(/g;

/**
 * Extrae nombres de funciones de un archivo JavaScript
 * Soporta:
 * - function nombreFuncion()
 * - async function nombreFuncion()
 * - const nombreFuncion = function()
 * - const nombreFuncion = async function()
 * - const nombreFuncion = () => {}
 * - const nombreFuncion = async () => {}
 * - nombreFuncion: function() {} (en objetos)
 * - nombreFuncion: async function() {} (en objetos)
 * 
 * @param {string} filePath - Ruta del archivo a analizar
 * @returns {Promise<string[]>} Array con nombres de funciones encontradas
 */
module.exports = async (filePath) => {
  try {
    const code = await fs.readFile(filePath, 'utf8');
    const matches = [];
    let m;
    
    // Limpiar comentarios de línea y bloque para evitar falsos positivos
    const cleanCode = code
      .replace(/\/\*[\s\S]*?\*\//g, '') // Comentarios de bloque
      .replace(/\/\/.*$/gm, ''); // Comentarios de línea
    
    while ((m = FN_REGEX.exec(cleanCode))) {
      // Capturar el primer grupo no vacío
      const functionName = m[1] || m[2] || m[3] || m[4] || m[5];
      if (functionName && !matches.includes(functionName)) {
        matches.push(functionName);
      }
    }
    
    return matches;
  } catch (error) {
    console.error(`Error extrayendo funciones de ${filePath}:`, error.message);
    return [];
  }
};