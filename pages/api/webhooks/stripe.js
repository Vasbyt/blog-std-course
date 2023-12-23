import Cors from 'micro-cors';
import stripeInit from 'stripe';
import verifyStripe from '@webdeveducation/next-verify-stripe';
import clientPromise from '../../../lib/mongodb';

const cors = Cors({
  allowMethods: ['POST', 'HEAD'],
});

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = stripeInit(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const handler = async (req, res) => {
  if (req.method === 'POST') {
    let event;
    try {
      event = await verifyStripe({
        req,
        stripe,
        endpointSecret,
      });
    } catch (e) {
      console.error('Error verifying Stripe webhook:', e);
      res.status(400).json({ error: 'Webhook verification failed' });
      return;
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const client = await clientPromise;
        try {
          const db = client.db('BlogStandard');

          const paymentIntent = event.data.object;
          const auth0Id = paymentIntent.metadata.sub;

          console.log('Received payment_intent.succeeded event. Auth0 ID:', auth0Id);

          const userProfile = await db.collection('users').updateOne(
            {
              auth0Id,
            },
            {
              $inc: {
                availableTokens: 10,
              },
              $setOnInsert: {
                auth0Id,
              },
            },
            {
              upsert: true,
            }
          );

          console.log('User profile updated:', userProfile);
        } catch (error) {
          console.error('Error updating user profile in MongoDB:', error);
          res.status(500).json({ error: 'Internal server error' });
          return;
        }
        break;
      }
      default:
        console.log('Unhandled event type:', event.type);
    }

    res.status(200).json({ received: true });
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
};

export default cors(handler);

