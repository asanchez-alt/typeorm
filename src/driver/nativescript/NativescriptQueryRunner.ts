import {ObjectLiteral} from "../../common/ObjectLiteral";
import {QueryRunnerAlreadyReleasedError} from "../../error/QueryRunnerAlreadyReleasedError";
import {QueryFailedError} from "../../error/QueryFailedError";
import {AbstractSqliteQueryRunner} from "../sqlite-abstract/AbstractSqliteQueryRunner";
import {NativescriptDriver} from "./NativescriptDriver";
import {Broadcaster} from "../../subscriber/Broadcaster";
import { QueryResult } from "../../query-runner/QueryResult";

/**
 * Runs queries on a single sqlite database connection.
 */
export class NativescriptQueryRunner extends AbstractSqliteQueryRunner {

    /**
     * Database driver used by connection.
     */
    driver: NativescriptDriver;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(driver: NativescriptDriver) {
        super();
        this.driver = driver;
        this.connection = driver.connection;
        this.broadcaster = new Broadcaster(this);
    }

    /**
     * Executes a given SQL query.
     */
    async query(query: string, parameters?: any[], useStructuredResult = false): Promise<any> {
        if (this.isReleased)
            throw new QueryRunnerAlreadyReleasedError();

        const connection = this.driver.connection;

        return new Promise( (ok, fail) => {
            const isInsertQuery = query.substr(0, 11) === "INSERT INTO";

            const handler = function (err: any, raw: any) {

                // log slow queries if maxQueryExecution time is set
                const maxQueryExecutionTime = connection.options.maxQueryExecutionTime;
                const queryEndTime = +new Date();
                const queryExecutionTime = queryEndTime - queryStartTime;
                if (maxQueryExecutionTime && queryExecutionTime > maxQueryExecutionTime)
                    connection.logger.logQuerySlow(queryExecutionTime, query, parameters, this);

                if (err) {
                    connection.logger.logQueryError(err, query, parameters, this);
                    fail(new QueryFailedError(query, parameters, err));
                } else {
                    const result = new QueryResult();

                    result.raw = raw;

                    if (!isInsertQuery && Array.isArray(raw)) {
                        result.records = raw;
                    }

                    if (useStructuredResult) {
                        ok(result);
                    } else {
                        ok(result.raw);
                    }
                }
            };
            this.driver.connection.logger.logQuery(query, parameters, this);
            const queryStartTime = +new Date();
            this.connect().then(databaseConnection => {
                if (isInsertQuery) {
                    databaseConnection.execSQL(query, parameters, handler);
                } else {
                    databaseConnection.all(query, parameters, handler);
                }
            });
        });
    }

    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------

    /**
     * Parametrizes given object of values. Used to create column=value queries.
     */
    protected parametrize(objectLiteral: ObjectLiteral, startIndex: number = 0): string[] {
        return Object.keys(objectLiteral).map((key, index) => `"${key}"` + "=?");
    }
}
