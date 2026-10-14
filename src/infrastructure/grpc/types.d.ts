import { Observable } from "rxjs";

declare global {
    namespace GRPC {
        namespace AccessControl {
            namespace Service {
                interface Contract {
                    listEffectivePrivileges(props: Request): Observable<Response>;
                }

                type Request = GRPC.AccessControl.ListEffectivePrivileges.Request;
                type Response = GRPC.AccessControl.ListEffectivePrivileges.Response;
            }

            namespace Client {
                interface Contract {
                    listEffectivePrivileges(props: Request): Response;
                }

                type Request = GRPC.AccessControl.ListEffectivePrivileges.Request;
                type Response = Promise<GRPC.AccessControl.ListEffectivePrivileges.Response>;
            }
        }
    }
}
