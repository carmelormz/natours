/* eslint-disable */
import axios from 'axios';
import { showAlert } from './alerts';

const stripe = Stripe(
  'pk_test_51IYY6cEG71mD65KwMqGs7oEkQfPLEk1rnSfYuiw16qq0tgVYc49JAAneadbaItCySLUSdELOuO7pMARA9kQBXyDU00cVwntYce'
);

export const bookTour = async (tourId) => {
  try {
    //1.  Get Session from Server
    const result = await axios(`/api/v1/bookings/checkout-session/${tourId}`);

    //2. Create checkout form + charge credit card
    await stripe.redirectToCheckout({
      sessionId: result.data.session.id,
    });
  } catch (err) {
    showAlert('error', err);
  }
};
