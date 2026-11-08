import {OpenAIImage as ImageClient} from '@stevelife/ai-kit';
import {buildArtPrompt} from '../art-direction.js';
export class OpenAIImage extends ImageClient {
 async generate(input: any = {}) {
 const prompt = input.artDirected === true ? input.prompt : buildArtPrompt(input);
 return super.generate({...input, prompt});
 }
}
