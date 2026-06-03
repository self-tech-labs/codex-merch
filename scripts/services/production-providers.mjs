export const productionProviders = {
  printful: {
    name: 'printful',
    requiredEnv: ['PRINTFUL_TOKEN', 'PRINTFUL_STORE_ID'],
  },
};

export function providerForProduction(name) {
  const provider = productionProviders[name];
  if (!provider) {
    throw new Error(`Unsupported production provider: ${name}`);
  }

  return provider;
}
