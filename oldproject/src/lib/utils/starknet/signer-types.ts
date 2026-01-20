import {
	CairoCustomEnum,
	CairoOption,
	CairoOptionVariant,
	CallData,
	ETransactionVersion3,
	SignerInterface,
	ec,
	hash,
	stark,
	transaction,
	typedData,
	type Call,
	type Calldata,
	type DeclareSignerDetails,
	type DeployAccountSignerDetails,
	type InvocationsSignerDetails,
	type Signature,
	type TypedData,
	type V3DeclareSignerDetails,
	type V3DeployAccountSignerDetails,
	type V3InvocationsSignerDetails
} from 'starknet';

export abstract class RawSigner implements SignerInterface {
	abstract signRaw(messageHash: string): Promise<string[]>;

	public async getPubKey(): Promise<string> {
		throw new Error('This signer allows multiple public keys');
	}

	public async signMessage(
		typedDataArgument: TypedData,
		accountAddress: string
	): Promise<Signature> {
		const messageHash = typedData.getMessageHash(typedDataArgument, accountAddress);
		return this.signRaw(messageHash);
	}

	public async signTransaction(
		transactions: Call[],
		details: InvocationsSignerDetails
	): Promise<Signature> {
		const compiledCalldata = transaction.getExecuteCalldata(transactions, details.cairoVersion);

		if (!Object.values(ETransactionVersion3).includes(details.version as any)) {
			throw new Error('Only V3 transactions are supported');
		}

		const det = details as V3InvocationsSignerDetails;
		const msgHash = hash.calculateInvokeTransactionHash({
			...det,
			senderAddress: det.walletAddress,
			compiledCalldata,
			version: det.version,
			nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
			feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode),
			accountDeploymentData: [],
			tip: 0n,
			paymasterData: []
		});

		return await this.signRaw(msgHash);
	}

	public async signDeployAccountTransaction(
		details: DeployAccountSignerDetails
	): Promise<Signature> {
		const compiledConstructorCalldata = CallData.compile(details.constructorCalldata);

		if (!Object.values(ETransactionVersion3).includes(details.version as any)) {
			throw new Error('Only V3 transactions are supported');
		}

		const det = details as V3DeployAccountSignerDetails;
		const msgHash = hash.calculateDeployAccountTransactionHash({
			...det,
			salt: det.addressSalt,
			compiledConstructorCalldata,
			version: det.version,
			nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
			feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode)
		});

		return await this.signRaw(msgHash);
	}

	public async signDeclareTransaction(
		// contractClass: ContractClass,  // Should be used once class hash is present in ContractClass
		details: DeclareSignerDetails
	): Promise<Signature> {
		if (!Object.values(ETransactionVersion3).includes(details.version as any)) {
			throw new Error('Only V3 transactions are supported');
		}

		const det = details as V3DeclareSignerDetails;
		const msgHash = hash.calculateDeclareTransactionHash({
			...det,
			version: det.version,
			nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
			feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode)
		});

		return await this.signRaw(msgHash);
	}
}

export class MultisigSigner extends RawSigner {
	constructor(public keys: KeyPair[]) {
		super();
	}

	async signRaw(messageHash: string): Promise<string[]> {
		const keys = [];
		for (const key of this.keys) {
			keys.push(await key.signRaw(messageHash));
		}
		return [keys.length.toString(), keys.flat()].flat();
	}
}

export class DummySigner extends MultisigSigner {
	constructor(
		public owner: KeyPair = dummyKeyPair(),
		public guardian?: KeyPair
	) {
		const signers = [owner];
		if (guardian) {
			signers.push(guardian);
		}
		super(signers);
	}
}

export abstract class KeyPair extends RawSigner {
	abstract get signer(): CairoCustomEnum;
	abstract get guid(): bigint;
	abstract get storedValue(): bigint;

	public get compiledSigner(): Calldata {
		return CallData.compile([this.signer]);
	}

	public get signerAsOption() {
		return new CairoOption(CairoOptionVariant.Some, {
			signer: this.signer
		});
	}
	public get compiledSignerAsOption() {
		return CallData.compile([this.signerAsOption]);
	}
}

export class DummyKeyPair extends KeyPair {
	pk: string;

	constructor(pk?: string | bigint) {
		super();
		this.pk = pk ? '' : '';
	}

	public get privateKey(): string {
		return this.pk;
	}

	public get publicKey() {
		return BigInt(0);
	}

	public get guid() {
		return BigInt(0);
	}

	public get storedValue() {
		return this.publicKey;
	}

	public get signerType(): SignerType {
		return SignerType.Starknet;
	}

	public get signer(): CairoCustomEnum {
		return signerTypeToCustomEnum(this.signerType, { signer: this.publicKey });
	}

	public async signRaw(messageHash: string): Promise<string[]> {
		const { r, s } = ec.starkCurve.sign(messageHash, this.pk);
		return starknetSignatureType(this.publicKey, r, s);
	}
}

export function starknetSignatureType(
	signer: bigint | number | string,
	r: bigint | number | string,
	s: bigint | number | string
) {
	return CallData.compile([signerTypeToCustomEnum(SignerType.Starknet, { signer, r, s })]);
}

export function zeroStarknetSignatureType() {
	return signerTypeToCustomEnum(SignerType.Starknet, { signer: 0 });
}

// reflects the signer type in signer_signature.cairo
// needs to be updated for the signer types
// used to convert signertype to guid
export enum SignerType {
	Starknet,
	Secp256k1,
	Secp256r1,
	Eip191,
	Webauthn
}

export function signerTypeToCustomEnum(signerType: SignerType, value: any): CairoCustomEnum {
	const contents: any = {};

	if (signerType === SignerType.Starknet) {
		contents.Starknet = value;
	} else if (signerType === SignerType.Secp256k1) {
		contents.Secp256k1 = value;
	} else if (signerType === SignerType.Secp256r1) {
		contents.Secp256r1 = value;
	} else if (signerType === SignerType.Eip191) {
		contents.Eip191 = value;
	} else if (signerType === SignerType.Webauthn) {
		contents.Webauthn = value;
	} else {
		throw new Error(`Unknown SignerType`);
	}

	return new CairoCustomEnum(contents);
}

export function sortByGuid(keys: KeyPair[]) {
	return keys.sort((n1, n2) => (n1.guid < n2.guid ? -1 : 1));
}

export const dummyKeyPair = () => new DummyKeyPair();
