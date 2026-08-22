import { AppModule } from './app.module';
import { CommandFactory } from 'nest-commander';

async function bootstrap() {
  await CommandFactory.run(AppModule, ['warn', 'error', 'debug']);
  process.exit(0);
}
bootstrap();
