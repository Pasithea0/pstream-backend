import { ChallengeCode } from '@/db/models/ChallengeCode';
import { formatSession } from '@/db/models/Session';
import { User } from '@/db/models/User';
import { assertChallengeCode } from '@/services/challenge';
import { StatusError } from '@/services/error';
import { handle } from '@/services/handler';
import { makeRouter } from '@/services/router';
import { makeSession, makeSessionToken } from '@/services/session';
import { z } from 'zod';

const startSchema = z.object({
  publicKey: z.string(),
});

const completeSchema = z.object({
  publicKey: z.string(),
  challenge: z.object({
    code: z.string(),
    signature: z.string(),
  }),
  device: z.string().max(500).min(1),
});

export const loginAuthRouter = makeRouter((app) => {
  app.post(
    '/auth/login/start',
    { schema: { body: startSchema } },
    handle(async ({ em, body }) => {
      const user = await em.findOne(User, { publicKey: body.publicKey });

      if (user == null) {
        throw new StatusError('User cannot be found', 401);
      }

      const challenge = new ChallengeCode();
      challenge.authType = 'mnemonic';
      challenge.flow = 'login';

      await em.persistAndFlush(challenge);

      return {
        challenge: challenge.code,
      };
    }),
  ),
    app.post(
      '/auth/login/complete',
      { schema: { body: completeSchema } },
      handle(async ({ em, body, req }) => {
        await assertChallengeCode(
          em,
          body.challenge.code,
          body.publicKey,
          body.challenge.signature,
          'login',
          'mnemonic',
        );

        const user = await em.findOne(User, { publicKey: body.publicKey });

        if (user == null) {
          throw new StatusError('User cannot be found', 401);
        }

        user.lastLoggedIn = new Date();

        const session = makeSession(
          user.id,
          body.device,
          req.headers['user-agent'],
        );

        await em.persistAndFlush([session, user]);

        return {
          session: formatSession(session),
          token: makeSessionToken(session),
        };
      }),
    );
});
