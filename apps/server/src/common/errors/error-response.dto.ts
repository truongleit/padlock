export class ErrorDetailDto {
  field!: string;
  messages!: string[];
}

export class ErrorResponseDto {
  statusCode!: number;
  code!: string;
  message!: string;
  details?: ErrorDetailDto[];
  path!: string;
  timestamp!: string;
}
