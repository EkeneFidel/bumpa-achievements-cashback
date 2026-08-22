import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserService } from '../user/user.service';


@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) { }

  async validateUser(username: string, password: string) {
    const user = await this.userService.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password: _password, ...result } = user
    return result;
  }

  login(user: { id: string; username: string }) {
    const payload = { sub: user.id, username: user.username };
    return {
      message: 'User logged in successfully ',
      user,
      access_token: this.jwtService.sign(payload),
    };
  }
}
