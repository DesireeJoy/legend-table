# Legend Table

A local card game against a computer-controlled robot or another player sharing the same device. The app runs in a browser and saves games, decks, hands, and progress as JSON on the local computer.

Player 1's cards feature a fire dog and Player 2's cards feature a water dog, including in existing saved games. The artwork follows the card's owner, even when the players switch turns. Both dogs also appear in the battlefield background on their respective players' sides.

## Run

Install Node.js 18 or newer, then in this folder run:

```powershell
npm start
```

Open the address printed in the terminal (normally `http://127.0.0.1:3000`). Keep the terminal open while playing. To use another port, set `PORT` before starting. The server listens only on this computer.

## Host on GitHub Pages

The browser client can also run as a static site on GitHub Pages. It stores saved games in that browser's `localStorage`, so each device has its own games and no Node.js server is needed.

In the repository settings, open **Pages**, choose **GitHub Actions** as the source, and deploy the `public` folder. A workflow can publish the folder with the official GitHub Pages actions. Use relative asset paths as included in `public/index.html`, so the game works at a project-site URL such as `https://OWNER.github.io/REPOSITORY/`.

GitHub Pages hosting is intended for the robot and same-device modes. It does not provide shared online multiplayer or server-side backups.

## Play

1. Start a game, choose a robot or another player on the same device, enter both names, and select who goes first. Player 1 has a 100-card fire deck; Player 2 or the robot has a 100-card water deck. You can edit or replace either deck before starting: enter one card per line, such as `Forest Guardian, 300`. Each line is a separate card; duplicate lines are allowed. Each deck needs 5–200 cards, including at least one with a value of 600 or less. Values are positive whole numbers up to 1,000,000. Existing saved games keep their original decks.
2. Each player draws five cards. If none can ever be a legend (all are above 600), the opening hand is shuffled back and redrawn. Players take turns setting up: roll a six-sided die, select a legend with value no greater than the roll times 100, then optionally play up to two protectors whose **combined** value does not exceed that same limit. If the roll cannot select any legend, roll again.
3. On each turn, draw one card, roll, optionally play protectors, and attack. On later turns, each newly played protector must individually fit the roll times 100. At most two protectors can be on a player's field.
4. Select an attacking protector and an opposing protector. Equal or higher value defeats the defender; a lower-value attack is not available. Attackers are not defeated on their own turn and can attack repeatedly. When no protectors remain, an equal or higher attack defeats the opposing legend and wins. End the turn when finished attacking.
5. A player who cannot draw at the start of their turn loses.

The robot automatically rolls, chooses its legend, plays eligible protectors, and attacks according to the same rules. Its actions appear in Game activity. Games resume with the same opponent type after restarting the app.

The pass-device screen helps players avoid seeing each other's hands, but it is not a security boundary: the saved JSON contains both hands and decks. Games are saved after every action to `data/games.json`. Back up that file to keep your games; deleting it removes saved games. The app is designed for one local server process, not concurrent servers sharing the same data folder. Any earlier `data/sessions.json` file is retained separately and is not changed by the game.

## Tests

```powershell
npm test
```
