# Audit report

p5 = 5th-percentile contrast under the element (worst realistic pixel). Need 4.5 text / 3.0 large text and icons. Issues = clipping / overlap.
**Totals: 4 contrast failures, 2 layout issues over 3 frame variants.**

## home [light]: 37 measured, 0 below target, 0 layout issues
## trips [light]: 50 measured, 3 below target, 0 layout issues
- FAIL text "1" 14px/600 p5=4.46 median=4.46 need 4.5
- FAIL text "4,210 km" 13px/600 p5=2.06 median=2.06 need 4.5
- FAIL text "Lisbon weekend" 17px/600 p5=1.23 median=11.09 need 4.5
## trip [light]: 58 measured, 1 below target, 2 layout issues
- FAIL text "9:41" 16px/600 p5=4.37 median=5.14 need 4.5 [status]
- LAYOUT outside-phone: D6
- LAYOUT outside-phone: 17 Oct