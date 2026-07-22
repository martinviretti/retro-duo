export const CATALOG = [
  {
    id: 'streets-of-rage',
    title: 'Streets of Rage',
    short: 'SOR',
    genre: 'Beat ’em up',
    note: 'Cooperativo callejero',
    accent: 'rose'
  },
  {
    id: 'streets-of-rage-2',
    title: 'Streets of Rage 2',
    short: 'SOR 2',
    genre: 'Beat ’em up',
    note: 'La opción principal',
    accent: 'violet'
  },
  {
    id: 'streets-of-rage-3',
    title: 'Streets of Rage 3',
    short: 'SOR 3',
    genre: 'Beat ’em up',
    note: 'Más personajes y velocidad',
    accent: 'orange'
  },
  {
    id: 'golden-axe',
    title: 'Golden Axe',
    short: 'GA',
    genre: 'Acción',
    note: 'Espadas, magia y cooperativo',
    accent: 'amber'
  },
  {
    id: 'golden-axe-2',
    title: 'Golden Axe II',
    short: 'GA II',
    genre: 'Acción',
    note: 'Cooperativo de fantasía',
    accent: 'gold'
  },
  {
    id: 'alien-storm',
    title: 'Alien Storm',
    short: 'AS',
    genre: 'Acción',
    note: 'Cooperativo contra invasores',
    accent: 'lime'
  },
  {
    id: 'gunstar-heroes',
    title: 'Gunstar Heroes',
    short: 'GH',
    genre: 'Run and gun',
    note: 'Acción rápida para dos',
    accent: 'cyan'
  },
  {
    id: 'contra-hard-corps',
    title: 'Contra: Hard Corps',
    short: 'CHC',
    genre: 'Run and gun',
    note: 'Desafío intenso',
    accent: 'red'
  },
  {
    id: 'tmnt-hyperstone',
    title: 'TMNT: The Hyperstone Heist',
    short: 'TMNT',
    genre: 'Beat ’em up',
    note: 'Cooperativo clásico',
    accent: 'green'
  },
  {
    id: 'mega-bomberman',
    title: 'Mega Bomberman',
    short: 'MB',
    genre: 'Acción / versus',
    note: 'Ideal para partidas cortas',
    accent: 'blue'
  },
  {
    id: 'two-crude-dudes',
    title: 'Two Crude Dudes',
    short: '2CD',
    genre: 'Beat ’em up',
    note: 'Cooperativo arcade',
    accent: 'pink'
  },
  {
    id: 'bonanza-bros',
    title: 'Bonanza Bros.',
    short: 'BB',
    genre: 'Acción / sigilo',
    note: 'Cooperativo diferente',
    accent: 'teal'
  }
];

export const DEMO_GAME = {
  id: 'neon-brawl-demo',
  title: 'Neon Brawl',
  short: 'DEMO',
  genre: 'Demo legal incluida',
  note: 'Probá conexión y controles sin ROM',
  accent: 'demo'
};

export function getCatalogItem(id) {
  return CATALOG.find((item) => item.id === id) || null;
}
