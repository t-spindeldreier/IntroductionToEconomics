// Nicknames are stored as two list positions (adjective, economist), never as text.
// That is what guarantees that nothing a student types can appear on the projector.
//
// IMPORTANT: firestore.rules checks the positions against the list lengths
// (N_ADJ and N_ECO there). A unit test fails if the numbers drift apart.
// Only ever APPEND to these lists while a room is in use; reordering renames people.

export const ADJECTIVES = [
  'Exogenous', 'Unbiased', 'Efficient', 'Robust', 'Rational', 'Optimal', 'Elastic', 'Consistent',
  'Significant', 'Causal', 'Stochastic', 'Dynamic', 'Counterfactual', 'Empirical', 'Aggregate', 'Competitive',
  'Strategic', 'Sustainable', 'Productive', 'Prudent', 'Liquid', 'Diversified', 'Altruistic', 'Patient',
  'Cooperative', 'Credible', 'Stable', 'Balanced', 'Transparent', 'Innovative', 'Resilient', 'Frugal',
  'Curious', 'Rigorous', 'Identified', 'Instrumental', 'Convex', 'Monotonic', 'Stationary', 'Asymptotic',
  'Parsimonious', 'Complementary', 'Incentivized', 'Risk-neutral', 'Randomized', 'Endogenous', 'Thrifty', 'Pareto-efficient',
];

export const ECONOMISTS = [
  'Ostrom', 'Keynes', 'Smith', 'Ricardo', 'Robinson', 'Sen', 'Duflo', 'Banerjee',
  'Goldin', 'Kahneman', 'Nash', 'Arrow', 'Becker', 'Coase', 'Hayek', 'Marshall',
  'Pigou', 'Schumpeter', 'Solow', 'Stiglitz', 'Tirole', 'Akerlof', 'Spence', 'Thaler',
  'Deaton', 'Card', 'Angrist', 'Imbens', 'Kremer', 'Romer', 'Nordhaus', 'Krugman',
  'Samuelson', 'Friedman', 'Hicks', 'Myrdal', 'Leontief', 'Kuznets', 'Lewis', 'Schelling',
  'Vickrey', 'Mirrlees', 'Heckman', 'McFadden', 'Granger', 'Phelps', 'Williamson', 'Diamond',
  'Pissarides', 'Roth', 'Shapley', 'Shiller', 'Hart', 'Milgrom', 'Acemoglu', 'Veblen',
  'Mill', 'Walras', 'Pareto', 'Edgeworth', 'Hirschman', 'Boserup', 'Yellen', 'Rodrik',
];

export function nickname(adj: number, eco: number): string {
  return `${ADJECTIVES[adj] ?? 'Anonymous'} ${ECONOMISTS[eco] ?? 'Economist'}`;
}

export function randomNick(rand: () => number = Math.random): { adj: number; eco: number } {
  return {
    adj: Math.floor(rand() * ADJECTIVES.length),
    eco: Math.floor(rand() * ECONOMISTS.length),
  };
}
