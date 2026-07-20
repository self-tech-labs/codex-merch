import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {sanitizeStructuredStrings} from './text-safety.mjs';

const schemaUrls = {
  trend: new URL('../../merch/weekly/schemas/trend.schema.json', import.meta.url),
  artDirection: new URL(
    '../../merch/weekly/schemas/art-direction.schema.json',
    import.meta.url,
  ),
  visualCritic: new URL(
    '../../merch/weekly/schemas/visual-critic.schema.json',
    import.meta.url,
  ),
};

const schemas = Object.fromEntries(
  Object.entries(schemaUrls).map(([name, url]) => [
    name,
    JSON.parse(readFileSync(url, 'utf8')),
  ]),
);

const ajv = new Ajv2020({allErrors: true, strict: false});
addFormats(ajv);
const validators = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)]),
);

export function weeklySchema(name) {
  const schema = schemas[name];
  if (!schema) throw new Error(`Unknown weekly schema: ${name}`);
  return structuredOutputSchema(schema);
}

export function validateWeeklyOutput(name, value) {
  const validate = validators[name];
  if (!validate) throw new Error(`Unknown weekly schema: ${name}`);
  const sanitized = sanitizeStructuredStrings(value);
  if (validate(sanitized)) return sanitized;

  const detail = (validate.errors || [])
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join('; ');
  throw new Error(`Invalid ${name} model output: ${detail}`);
}

function structuredOutputSchema(value) {
  if (Array.isArray(value)) return value.map(structuredOutputSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$schema')
      .map(([key, child]) => [key, structuredOutputSchema(child)]),
  );
}
