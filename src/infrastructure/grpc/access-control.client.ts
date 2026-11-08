import { type ClientGrpc as ClientGRPC } from "@nestjs/microservices";
import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { firstValueFrom, timeout } from "rxjs";

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
        const response = this.service.listEffectivePrivileges(request).pipe(timeout(1000));
        const { privileges, global, revision, globalRevision, revisioned } = await firstValueFrom(response);
        return {
            globalRevision: globalRevision ?? {},
            revisioned: revisioned ?? false,
            privileges: privileges ?? {},
            revision: revision ?? {},
            global: global ?? {},
        };
    }
}
