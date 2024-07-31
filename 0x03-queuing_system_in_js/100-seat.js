import { createQueue } from 'kue';
import express from 'express';
import { createClient } from 'redis';
import { promisify } from 'util';

const client = createClient({ name: 'reserve_seat' });
const appl = express();
const q = createQueue();
const INITIAL_SEATS_COUNT = 50;
let reservationEnabled = false;
const PORT = 1245;

const reserveSeat = async (number) => {
  return promisify(client.SET).bind(client)('available_seats', number);
};

const getCurrentAvailableSeats = async () => {
  return promisify(client.GET).bind(client)('available_seats');
};

appl.get('/available_seats', (_, res) => {
  getCurrentAvailableSeats()
    .then((numberOfAvailableSeats) => {
      res.json({ numberOfAvailableSeats })
    });
});

appl.get('/reserve_seat', (_req, res) => {
  if (!reservationEnabled) {
    res.json({ status: 'Reservation are blocked' });
    return;
  }
  try {
    const jj = q.create('reserve_seat');

    jj.on('failed', (err) => {
      console.log(
        'Seat reservation jj',
        jj.id,
        'failed:',
        err.message || err.toString(),
      );
    });
    jj.on('complete', () => {
      console.log(
        'Seat reservation jj',
        jj.id,
        'completed'
      );
    });
    jj.save();
    res.json({ status: 'Reservation in process' });
  } catch {
    res.json({ status: 'Reservation failed' });
  }
});

appl.get('/process', (_req, res) => {
  res.json({ status: 'Queue processing' });
  q.process('reserve_seat', (_jj, done) => {
    getCurrentAvailableSeats()
      .then((result) => Number.parseInt(result || 0))
      .then((availableSeats) => {
        reservationEnabled = availableSeats <= 1 ? false : reservationEnabled;
        if (availableSeats >= 1) {
          reserveSeat(availableSeats - 1)
            .then(() => done());
        } else {
          done(new Error('Not enough seats available'));
        }
      });
  });
});

const resetAvailableSeats = async (initialSeatsCount) => {
  return promisify(client.SET)
    .bind(client)('available_seats', Number.parseInt(initialSeatsCount));
};

appl.listen(PORT, () => {
  resetAvailableSeats(process.env.INITIAL_SEATS_COUNT || INITIAL_SEATS_COUNT)
    .then(() => {
      reservationEnabled = true;
      console.log(`API available on localhost port ${PORT}`);
    });
});

export default appl;
