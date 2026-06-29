import db from './src/services/db.js';
import tracingService from './src/services/agentTracingService.js';

console.log('Model costs in DB:');
const rows = db.prepare('SELECT * FROM model_costs').all();
console.log(JSON.stringify(rows, null, 2));

// Test getModelCost
const cost = tracingService.getModelCost('openai', 'gpt-4');
console.log('Cost for gpt-4:', cost);

// Test the cost calculation manually
if (cost) {
  const inputCost = (1000 / 1000) * cost.input_cost_per_1k;
  const outputCost = (1000 / 1000) * cost.output_cost_per_1k;
  const total = inputCost + outputCost;
  console.log(`Input cost: ${inputCost}, Output cost: ${outputCost}, Total: ${total}`);
}