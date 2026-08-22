import { SeedModule } from './database/seeds/seed.module';
import { CommandFactory } from 'nest-commander';

async function bootstrap() {
  await CommandFactory.run(SeedModule, ['log', 'warn', 'error', 'debug']);
  process.exit(0);
}
bootstrap();
