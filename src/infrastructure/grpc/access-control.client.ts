import { type ClientGrpc as ClientGRPC } from "@nestjs/microservices";
import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

import { GRPC_CONFIG } from "./tokens";

@Injectable()
export class AccessControlClient implements GRPC.AccessControl.Client.Contract, OnModuleInit {
    declare private service: GRPC.AccessControl.Service.Contract;

    public constructor(
        @Inject(GRPC_CONFIG)
        private readonly client: ClientGRPC,
    ) {}

    public onModuleInit(): void {
        this.service = this.client.getService<GRPC.AccessControl.Service.Contract>("AccessControlService");
    }

    public async listEffectivePrivileges(request: GRPC.AccessControl.Client.Request): GRPC.AccessControl.Client.Response {
        const response = this.service.listEffectivePrivileges(request);
        const { privileges, global } = await firstValueFrom(response);
        return { privileges: privileges ?? {}, global: global ?? {} };
    }
}
