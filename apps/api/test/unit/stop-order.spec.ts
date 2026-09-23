import { insertAt, moveTo, renumber, without } from '@/modules/trips/stop-order';

/**
 * Stop ordering (FR-010, FR-012) as pure list arithmetic.
 *
 * The persisted `sort_order` must stay contiguous from 0 so that a device
 * mirror and the server agree on what "the second stop" means, and so that an
 * insert in the middle needs no arc maintenance (FR-016 — there is no arc table
 * to maintain). These helpers produce the new order as a new value; the
 * repository then writes only the rows whose position actually changed, which
 * keeps the sync cursor (`updated_at`) honest.
 */
describe('stop order', () => {
  const order = ['zurich', 'paris', 'tokyo'];

  describe('insertAt', () => {
    it('appends when no position is given', () => {
      expect(insertAt(order, 'rome')).toEqual(['zurich', 'paris', 'tokyo', 'rome']);
    });

    it('inserts in the middle and shifts what follows', () => {
      expect(insertAt(order, 'rome', 1)).toEqual(['zurich', 'rome', 'paris', 'tokyo']);
    });

    it('clamps a position past the end to an append', () => {
      expect(insertAt(order, 'rome', 99)).toEqual(['zurich', 'paris', 'tokyo', 'rome']);
    });

    it('inserts at the front for position 0', () => {
      expect(insertAt(order, 'rome', 0)).toEqual(['rome', 'zurich', 'paris', 'tokyo']);
    });

    it('does not mutate its input', () => {
      const input = [...order];
      insertAt(input, 'rome', 1);
      expect(input).toEqual(order);
    });
  });

  describe('moveTo', () => {
    it('moves a stop forward', () => {
      expect(moveTo(order, 'tokyo', 0)).toEqual(['tokyo', 'zurich', 'paris']);
    });

    it('moves a stop backward', () => {
      expect(moveTo(order, 'zurich', 2)).toEqual(['paris', 'tokyo', 'zurich']);
    });

    it('clamps a position past the end to the last slot', () => {
      expect(moveTo(order, 'zurich', 99)).toEqual(['paris', 'tokyo', 'zurich']);
    });

    it('is a no-op when the stop is already there', () => {
      expect(moveTo(order, 'paris', 1)).toEqual(order);
    });

    it('leaves the list alone when the id is not in it', () => {
      expect(moveTo(order, 'nowhere', 0)).toEqual(order);
    });
  });

  describe('without', () => {
    it('removes the stop and closes the gap', () => {
      expect(without(order, 'paris')).toEqual(['zurich', 'tokyo']);
    });
  });

  describe('renumber', () => {
    it('yields only the rows whose position changed, with contiguous positions', () => {
      const previous = [
        { id: 'zurich', sortOrder: 0 },
        { id: 'paris', sortOrder: 1 },
        { id: 'tokyo', sortOrder: 2 },
      ];

      const changes = renumber(previous, ['tokyo', 'zurich', 'paris']);

      expect(changes).toEqual([
        { id: 'tokyo', sortOrder: 0 },
        { id: 'zurich', sortOrder: 1 },
        { id: 'paris', sortOrder: 2 },
      ]);
    });

    it('yields nothing when the order is already contiguous and unchanged', () => {
      const previous = [
        { id: 'zurich', sortOrder: 0 },
        { id: 'paris', sortOrder: 1 },
      ];

      expect(renumber(previous, ['zurich', 'paris'])).toEqual([]);
    });

    it('repairs gaps left by a deletion', () => {
      // paris (1) was removed; tokyo must slide from 2 to 1.
      const previous = [
        { id: 'zurich', sortOrder: 0 },
        { id: 'tokyo', sortOrder: 2 },
      ];

      expect(renumber(previous, ['zurich', 'tokyo'])).toEqual([
        { id: 'tokyo', sortOrder: 1 },
      ]);
    });

    it('assigns a position to an id that had none yet', () => {
      const previous = [{ id: 'zurich', sortOrder: 0 }];

      expect(renumber(previous, ['zurich', 'new'])).toEqual([
        { id: 'new', sortOrder: 1 },
      ]);
    });
  });
});
