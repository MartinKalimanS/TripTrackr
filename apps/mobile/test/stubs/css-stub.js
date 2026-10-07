/**
 * Jest has no CSS pipeline: Metro hands `global.css` to Uniwind, which turns it
 * into the class lookup the runtime reads. Under Jest `className` is an inert
 * prop, so an imported stylesheet is an empty module (feature 004, research D4-13).
 */
module.exports = {};
