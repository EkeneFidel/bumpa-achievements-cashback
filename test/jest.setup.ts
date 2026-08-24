import { ConsoleLogger } from '@nestjs/common';

jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation(() => undefined);
