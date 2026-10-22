# History Of All Prompt
*the version after each prompt's title is what game version that prompt originated*

## Initial Game Creation -- v0.1
I want you to create me a simple project (any programming language you like) for me to play this board game I made and test stuff out. I've attached a .zip file with the following information:

* rules.csv -> Rules of the game (barebones)
* roles.csv -> Roles of the characters in the game
* roster.csv -> Roster of characters in the game
* tokens.csv -> Tokens the characters in the game might create throughout the game
* tiles.csv -> Explanation of each tile in the game
* maps.csv -> The current 5 maps in the game
* testboard.png -> A visual example of the "Pride Map" so you can understand a bit more of how the maps.csv translate into a map


Some notes for how the game should be are following:

* It is a 2 player one screen game (but be aware that in the future we'll add a way to play with 2 windows in different PCs)


* Opening the game should have a menu with the following:
   * An option to play the normal draft mode;
   * An option to play a constructed mode (where instead of drafting, each player picks a team of 7 characters, characters may repeat across teams but not inside of a team)
   * A panel to see each hero's abilities
   * A map creator (for now, do not implement it)


* You don't have to add any images, I'll do that myself, but add a simple way, of game, that I can add images (like a specific folder inside of the project where I can just slot the images). Tell me after also how I can add those images (what folder, and what the formatting for the images names should be)


* Only implement the abilities of the following characters (Vanish, Glove, Driver, Sailor, Squeak, Monkey, Greyson, Trick, Note, Claws, Income, Hail, Oak, Clark, Bullseye, Smoke), and respective tokens. If a character does not have all three abilities, only implement the ones that character has


Any question you might have, like ambiguity, confirmation, etc., be sure to ask before building the project.


## Small Fixes and Visual Changes -- v0.2
Ok, I'm liking it so far, but I want you to change somethings, fix others, and add new stuff.

Change:

* Remove the "end turn" button, and change the "end round" button to a "pass round" button. Now, this button makes it so the player that presses it forgoes all their turns during this round (effectively giving the other player free turns until it uses all their AP);
* The lower bar during the game should have all the possible actions that player can take during that round (seperated by entities) for an easier visiblity. Also, communicate more clearly whose turn is which during the game (in a way that does not feel entrusive), an communicate more clearly current AP for both players. Also, at the end of every round, communicate clearly (again, non entrusive) what are the state of each objective (monetary, control and assassination). Add a little icon of the hero when selecting heroes in the buttons.
* Visual changes, whenever is a player's turn, the below box should be that color. Also, for now use random colors (or whatever you feel might fit each hero), but color code hero assets in a way it gives them a color identy, while still being able to identify if they are on the BLU or RED team (don't do this on the board, but do this on other aspects)
* In the hero abilities screen, if a hero creates a token, have a way for a user to go see what that token does


Fix:

* Oak's Acorn Rattle should only trigger when an entity PERFORMS a move. For example, if Clark uses his Tentacle Grab to move something, Acorn Rattle SHOULD NOT trigger;
* Vanish's Diamonds are Unbreakable is completely optional. You may decide to not use that ability when he dies;


Add:

* Autoplace button during the placement phase. It just places the heroes randomly, but it's MUCH faster for testing;
* Compbuilder : a new area in the menu where you can create team compositions and save them. Then, in the constructed mode, you can just pick already existing team compositions. Also, have pre-saved the team composition entilted "Interrail Comp" with the heroes (Vanish, Glove, Squeak, Greyson, Tune, Income and Hail);


Rules Missing (from the initial rules.csv file):

* An entity can't use the same action twice in a turn (but can use them along the round in other turns);
* During the pregame movement phase, all Control Points are counted as walls


## Map Maker Addition -- v0.3
Ok, everything seems to be working fine, apart from:

another rules clarification, during the pregame move phase, BLU entity cannot cross into Red territory, and the same for RED entities and BLU territory
Now, I want us to get into the MapMaker option on the Menu
In the Map Maker, you can both create new maps or edit existing maps (yours or built-in), and also delete non built-in maps.
The default max size you can make for a map is 12x12 (so from coordinates 0,0 to 11,11), but that can be changes in in-game options to a bigger size.
Some placement rules:

Whenever you place a teleport, you musst connect it to another teleport/anchor (according to the rules. You may either connect to an existing one, or create a new one of this two);
Whenever you place a High Ground tile, you must choose its direction
A map cannot be saved if you have not placed 7 Red Spawn tiles or 7 Blu Spawn tiles
any more questions, be sure to ask, if not, go for it

