// Tokens (see data/tokens.csv). Image file names live in assets/tokens/.
export const TOKENS = {
  rat: { name: 'Rat', cls: 'Entity', hp: 1, move: 6, atk: 0, reach: 1, ap: 0, image: 'rat.png',
    text: ['When you move this Rat, you may move your other Rats. Rat can move through walls or entities.',
      'When this Rat takes damage, if it was Squeak, flip it back to Squeak, and deal the damage that would have been dealt to Squeak, plus 2. If it was not, flip Squeak back, and you may stun an entity adjacent to Squeak.',
      'Flip Back (0 AP): If this Rat is Squeak, flip this back.'] },
  cat: { name: 'Cat', cls: 'Entity', hp: 5, move: 2, atk: 2, reach: 1, ap: 0, image: 'cat.png',
    text: ["Whenever Claws uses an action, Cat may perform an action for free after (Cat also moves when Claws does the pregame move).",
      "Cat has Claws' Piggy Back passive ability."] },
  ink: { name: 'Ink Machine', cls: 'Structure', hp: 2, image: 'ink_machine.png',
    text: ['The first time in a round an entity would move to an adjacent tile, stop its movement and stun it.',
      'Ink Machine can only be attacked by adjacent entities.'] },
  twod: { name: 'Two-D-ret', cls: 'Structure', hp: 2, image: 'two_d_ret.png',
    text: ['Each 3 actions the enemy team uses in a round, this deals 2 damage to an enemy entity 2 tiles away (even if the line of sight is blocked).'] },
  snowman: { name: 'Snowman', cls: 'Entity', hp: 1, image: 'snowman.png',
    text: ['Snowman cannot be dealt damage or moved.'] },
  smoke: { name: 'Smoke', cls: 'Environment', image: 'smoke.png',
    text: ['Entities cannot use attacks that would pass through, start or end in this tile.'] },
  shield: { name: 'Card Shield', cls: 'Equipment', image: 'card_shield.png',
    text: ['If the attached entity would receive damage, prevent that damage, then destroy Card Shield.',
      'Destroy Card Shield at the end of the round.'] },
};

// Which heroes create which tokens (used by the hero abilities screen)
export const HERO_TOKENS = {
  vanish: ['shield'], squeak: ['rat'], greyson: ['ink', 'twod'], claws: ['cat'], hail: ['snowman'], cigar: ['smoke'],
};
