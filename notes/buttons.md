AppTiles are just fancy buttons, buttons have multiple states that are interesting for us:

- focused
- hovered
- active

From the user perspective they can:

- navigate app tiles using keys, one button is always _focused_ and waiting to be pressed with enter key
- when user use cursor instead focused button is the button that is hovered, it also can be pressed with click
- when input method is switched previously focused app is taken into account: if user selected app A with keyboard, then selected app C with mouse and then pressed left on keyboard again they should get to app immediately to the left from C (B).

So each AppTile component should be able to do at least two things:

- focus itself when told programmatically
- focus itself when receive event from UI (literally focus by tabs or hover)

so focus == hovered in our case
