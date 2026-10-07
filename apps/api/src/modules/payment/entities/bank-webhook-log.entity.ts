import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('bank_webhook_logs')
@Index('bank_webhook_logs_reference_code_key', ['referenceCode'], {
  unique: true,
})
export class BankWebhookLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'reference_code', type: 'varchar', length: 128 })
  referenceCode: string;
  @Column({ type: 'boolean', default: false }) processed: boolean;
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
