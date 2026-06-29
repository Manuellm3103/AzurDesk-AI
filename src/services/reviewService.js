import db from '../services/db.js';
import { safeJson } from '../services/_utils.js';

const RUBRICS = {
  quality: {
    name: 'quality',
    checks: [
      (code) => (!code || code.trim().length < 10 ? { pass: false, issue: 'Código vacío o muy corto' } : { pass: true }),
      (code) => (/eval\(|Function\(|new Function/.test(code) ? { pass: false, issue: 'Uso inseguro de eval/new Function' } : { pass: true }),
      (code) => (/console\.log/.test(code) ? { pass: false, issue: 'console.log encontrado en producción' } : { pass: true })
    ]
  },
  security: {
    name: 'security',
    checks: [
      (code) => (/password\s*=\s*['"]/.test(code) || /JWT_SECRET\s*=\s*['"]/.test(code) ? { pass: false, issue: 'Posible secreto hardcodeado' } : { pass: true }),
      (code) => (/(SELECT|INSERT|UPDATE|DELETE).*\$\{/.test(code) ? { pass: false, issue: 'Posible SQL injection por interpolación' } : { pass: true }),
      (code) => (/innerHTML\s*=/.test(code) ? { pass: false, issue: 'Posible XSS por innerHTML' } : { pass: true })
    ]
  },
  efficiency: {
    name: 'efficiency',
    checks: [
      (code) => (/for\s*\([^)]*\)\s*\{[^}]*for\s*\(/.test(code) ? { pass: false, issue: 'Bucle anidado detectado' } : { pass: true }),
      (code) => (/(existsSync|readFileSync)\([^)]*\)/.test(code) ? { pass: false, issue: 'I/O síncrona en hot path' } : { pass: true }),
      (code) => (code.split('\n').length > 200 ? { pass: false, issue: 'Archivo muy largo, considerar dividir' } : { pass: true })
    ]
  }
};

class ReviewService {
  review(code) {
    const results = Object.values(RUBRICS).map((rubric) => {
      const findings = [];
      let pass = true;
      for (const check of rubric.checks) {
        const res = check(code);
        if (!res.pass) { pass = false; findings.push(res.issue); }
      }
      return { rubric: rubric.name, pass, findings };
    });
    return {
      overall: results.every((r) => r.pass),
      summary: results,
      token_estimate: Math.ceil(code.length / 4)
    };
  }
}

export default new ReviewService();
