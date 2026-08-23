import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AchievementGroup } from './achievement-group.entity';

@Entity('achievements')
export class Achievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AchievementGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: AchievementGroup;

  @Column()
  groupId: string;

  @Column()
  name: string;

  @Column('bigint')
  threshold: bigint;

  @Column('int')
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}
